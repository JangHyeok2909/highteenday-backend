package com.example.highteenday_backend.metrics;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 누적기 자체의 계산 규칙을 고정한다. Spring 컨텍스트가 필요 없는 순수 단위 테스트다.
 */
class QueryCountRecorderTest {

    private static final long ONE_MILLI_NANOS = 1_000_000L;

    @Nested
    @DisplayName("문장 수와 라운드트립")
    class Counting {

        @Test
        @DisplayName("일반 실행은 문장 1개, 라운드트립 1회로 센다")
        void singleExecutionCountsOnce() {
            QueryCountRecorder recorder = new QueryCountRecorder(false);

            recorder.record("select 1", ONE_MILLI_NANOS, 1);

            assertThat(recorder.statements()).isEqualTo(1);
            assertThat(recorder.roundTrips()).isEqualTo(1);
        }

        @Test
        @DisplayName("배치는 문장 N개, 라운드트립 1회로 센다")
        void batchCountsStatementsAndOneRoundTrip() {
            QueryCountRecorder recorder = new QueryCountRecorder(false);

            recorder.record("insert into t values (?)", ONE_MILLI_NANOS, 5);

            // MySQL 은 배치 안의 문장을 각각 questions 로 센다. 그래야 검산이 맞는다.
            assertThat(recorder.statements()).isEqualTo(5);
            // 네트워크 왕복은 한 번뿐이다. 이 둘이 벌어지면 배치가 동작한다는 뜻이다.
            assertThat(recorder.roundTrips()).isEqualTo(1);
        }

        @Test
        @DisplayName("DB 소요시간은 실행마다 누적된다")
        void dbTimeAccumulates() {
            QueryCountRecorder recorder = new QueryCountRecorder(false);

            recorder.record("select 1", 3 * ONE_MILLI_NANOS, 1);
            recorder.record("select 2", 4 * ONE_MILLI_NANOS, 1);

            assertThat(recorder.dbTimeMillis()).isEqualTo(7);
        }
    }

    @Nested
    @DisplayName("detail 모드")
    class Detail {

        @Test
        @DisplayName("꺼져 있으면 SQL 종류를 세지 않는다")
        void disabledDoesNotTrackSql() {
            QueryCountRecorder recorder = new QueryCountRecorder(false);

            recorder.record("select 1", ONE_MILLI_NANOS, 1);

            // 0(종류 없음)과 구분해야 하므로 -1 로 표시한다.
            assertThat(recorder.distinctSql()).isEqualTo(-1);
            assertThat(recorder.topSql(3)).isNull();
        }

        @Test
        @DisplayName("켜져 있으면 가장 많이 반복된 SQL 을 먼저 보여준다")
        void enabledRanksSqlByRepetition() {
            QueryCountRecorder recorder = new QueryCountRecorder(true);

            for (int i = 0; i < 300; i++) {
                recorder.record("select * from users where USR_id = ?", ONE_MILLI_NANOS, 1);
            }
            recorder.record("select * from comments where PST_id = ?", ONE_MILLI_NANOS, 1);

            assertThat(recorder.distinctSql()).isEqualTo(2);
            // N+1 의 N 이 여기 드러난다 — 같은 문장이 요청 한 번에 300회.
            assertThat(recorder.topSql(2)).startsWith("select * from users where USR_id = ? x300");
            assertThat(recorder.topSql(2)).contains("select * from comments where PST_id = ? x1");
        }

        @Test
        @DisplayName("줄바꿈이 섞인 긴 SQL 은 한 줄로 접어서 보여준다")
        void longSqlIsFlattenedAndAbbreviated() {
            QueryCountRecorder recorder = new QueryCountRecorder(true);

            recorder.record("select\n  a,\n  b\nfrom t", ONE_MILLI_NANOS, 1);

            assertThat(recorder.topSql(1)).isEqualTo("select a, b from t x1");
        }
    }
}
