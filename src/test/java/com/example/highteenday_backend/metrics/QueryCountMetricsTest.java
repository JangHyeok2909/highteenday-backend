package com.example.highteenday_backend.metrics;

import com.example.highteenday_backend.configs.TestFileStorageConfig;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * "요청당 쿼리 수" 계측 배선이 실제로 살아 있는지 확인한다.
 *
 * 여기서 확인하는 것은 값의 크기가 아니라 경로다.
 *   p6spy 리스너 → ThreadLocal 누적기 → 서블릿 필터 → Micrometer 지표
 * 이 사슬 중 하나라도 끊기면 지표는 조용히 0 이 되고, 그 상태로도 애플리케이션은
 * 정상 동작한다. 계측이 조용히 죽는 것을 막는 것이 이 테스트의 목적이다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestFileStorageConfig.class)
class QueryCountMetricsTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    MeterRegistry meterRegistry;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @AfterEach
    void clearContext() {
        // 테스트가 중간에 실패해도 누적기를 스레드에 남기지 않는다.
        QueryCountContext.end();
    }

    @Nested
    @DisplayName("p6spy 리스너")
    class Listener {

        @Test
        @DisplayName("계측 중인 스레드에서 실행된 문장을 센다")
        void countsStatementsOnActiveThread() {
            QueryCountContext.begin(true);
            jdbcTemplate.queryForObject("select 1", Integer.class);
            QueryCountRecorder recorder = QueryCountContext.end();

            assertThat(recorder).isNotNull();
            // 이 단언이 깨지면 JdbcEventListener 빈이 p6spy 팩토리에 수집되지 않은 것이다.
            assertThat(recorder.statements()).isEqualTo(1);
            assertThat(recorder.topSql(1)).contains("select 1");
        }

        @Test
        @DisplayName("계측 중이 아닌 스레드의 문장은 요청 밖 카운터로 간다")
        void countsStatementsOutsideRequestSeparately() {
            double before = outsideRequestCount();

            jdbcTemplate.queryForObject("select 1", Integer.class);

            // 스케줄러·커넥션 검증 쿼리가 엔드포인트 값에 섞이지 않는다는 확인이자,
            // "요청 합계 + 요청 밖 = MySQL questions" 검산의 분모를 만드는 값이다.
            assertThat(outsideRequestCount()).isEqualTo(before + 1);
        }

        @Test
        @DisplayName("배치 실행은 라운드트립 1회에 문장 N개로 센다")
        void countsBatchAsManyStatements() {
            jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
                try (Statement setup = connection.createStatement()) {
                    setup.execute("create local temporary table query_count_batch_test (id int)");
                }

                QueryCountContext.begin(false);
                try (Statement batch = connection.createStatement()) {
                    batch.addBatch("insert into query_count_batch_test values (1)");
                    batch.addBatch("insert into query_count_batch_test values (2)");
                    batch.addBatch("insert into query_count_batch_test values (3)");
                    batch.executeBatch();
                }
                return null;
            });
            QueryCountRecorder recorder = QueryCountContext.end();

            assertThat(recorder).isNotNull();
            assertThat(recorder.statements()).isEqualTo(3);
            assertThat(recorder.roundTrips()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("요청 필터")
    class Filter {

        @Test
        @DisplayName("URI 템플릿별로 요청당 쿼리 수를 기록한다")
        void recordsQueriesPerEndpoint() throws Exception {
            // 컨텍스트가 테스트 간에 공유되므로 절대값이 아니라 증분을 본다.
            long countBefore = summaryCount();
            double totalBefore = summaryTotal();

            mockMvc.perform(get("/api/boards"));

            assertThat(summaryCount()).isEqualTo(countBefore + 1);
            // /api/boards 는 게시판 목록 SELECT 한 번을 실행한다.
            assertThat(summaryTotal()).isGreaterThan(totalBefore);
            assertThat(timer().count()).isGreaterThan(0);
        }

        @Test
        @DisplayName("요청이 끝나면 스레드에 누적기를 남기지 않는다")
        void cleansUpAfterRequest() throws Exception {
            mockMvc.perform(get("/api/boards"));

            // 남으면 스레드를 재사용하는 다음 요청의 쿼리 수가 부풀려진다.
            assertThat(QueryCountContext.current()).isNull();
        }

        @Test
        @DisplayName("p95 를 낼 수 있도록 버킷을 함께 노출한다")
        void exposesHistogramBuckets() throws Exception {
            mockMvc.perform(get("/api/boards"));

            /*
             * 버킷이 없으면 Prometheus 에서 histogram_quantile() 을 쓸 수 없고 평균만 남는다.
             * 데이터 편차가 큰 엔드포인트(댓글 수천 개짜리 게시물)는 평균이 꼬리를 가리므로,
             * 이 지표에서 버킷은 선택이 아니라 전제다.
             */
            assertThat(summary().takeSnapshot().histogramCounts()).isNotEmpty();
        }

        @Test
        @DisplayName("인증에 막혀 컨트롤러까지 못 간 요청도 기록한다")
        void recordsRequestsRejectedBySecurity() throws Exception {
            DistributionSummary unknown = meterRegistry.find("http.server.queries")
                    .tag("uri", "UNKNOWN")
                    .tag("method", "GET")
                    .summary();
            long countBefore = unknown == null ? 0 : unknown.count();

            // 401 은 시큐리티 필터 체인에서 끝난다 — 핸들러 매핑이 없어 uri 태그는 UNKNOWN 이다.
            mockMvc.perform(get("/api/notifications"));

            /*
             * 이 단언이 깨지면 필터가 시큐리티 체인 안쪽에 등록된 것이다. 그 상태로는
             * 인증 과정에서 실행되는 사용자·토큰 조회가 요청당 쿼리 수에서 빠진다.
             */
            assertThat(meterRegistry.find("http.server.queries")
                    .tag("uri", "UNKNOWN")
                    .tag("method", "GET")
                    .summary().count()).isEqualTo(countBefore + 1);
        }

        private DistributionSummary summary() {
            return meterRegistry.find("http.server.queries")
                    .tag("uri", "/api/boards")
                    .tag("method", "GET")
                    .summary();
        }

        private long summaryCount() {
            DistributionSummary summary = summary();
            return summary == null ? 0 : summary.count();
        }

        private double summaryTotal() {
            DistributionSummary summary = summary();
            return summary == null ? 0 : summary.totalAmount();
        }

        private Timer timer() {
            return meterRegistry.find("http.server.query.time")
                    .tag("uri", "/api/boards")
                    .tag("method", "GET")
                    .timer();
        }
    }

    private double outsideRequestCount() {
        var counter = meterRegistry.find("db.queries.outside.request").functionCounter();
        return counter == null ? 0 : counter.count();
    }
}
