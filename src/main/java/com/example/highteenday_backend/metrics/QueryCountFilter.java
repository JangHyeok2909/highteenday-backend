package com.example.highteenday_backend.metrics;

import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * 요청 하나가 실행한 쿼리 수를 엔드포인트별로 기록하는 필터.
 *
 * 왜 필터이고, 왜 가장 바깥인가.
 * 컨트롤러 진입/이탈(AOP)을 기준으로 재면 두 구간을 놓친다.
 * - 인증 필터가 실행하는 사용자·토큰 조회 (TokenAuthenticationFilter)
 * - open-in-view가 켜져 있어 응답 직렬화 중에 풀리는 지연 로딩 SELECT
 * 둘 다 그 요청이 DB에 지운 실제 부하다. 그래서 "요청당 쿼리 수"를 인증부터 응답
 * 직렬화까지 포함한 총량으로 정의하고, 이 필터를 시큐리티 체인보다 바깥에 둔다.
 *
 * 내보내는 지표
 * - {@code http.server.queries}    엔드포인트별 요청당 문장 수 분포(버킷 포함)
 * - {@code http.server.query.time} 엔드포인트별 요청당 DB 소요시간 합
 *
 * 평균만으로는 부족해서 분포를 낸다. 댓글이 3,908개인 게시물처럼 데이터 편차가 큰
 * 엔드포인트는 평균이 꼬리를 완전히 가린다.
 */
@Slf4j
public class QueryCountFilter extends OncePerRequestFilter {

    /**
     * 쿼리 수 히스토그램 경계.
     *
     * percentiles-histogram을 켜면 타이머 하나가 버킷 70개 이상으로 퍼지고, 그것이
     * 엔드포인트 수만큼 곱해진다. 관심 구간만 고정 경계로 잡아 엔드포인트당 버킷을
     * 11개로 제한한다. 경계 밖은 +Inf로 모인다.
     */
    private static final double[] QUERY_COUNT_BUCKETS = {1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000};

    /** 핸들러 매핑 전에 끝난 요청(인증 실패, 404)의 uri 태그. 태그 폭증을 막는 값이기도 하다. */
    private static final String UNKNOWN_URI = "UNKNOWN";

    private static final int TOP_SQL_IN_LOG = 3;

    private final MeterRegistry registry;
    private final boolean detailEnabled;
    private final int warnThreshold;
    private final List<String> ignoredPathPrefixes;

    private final Map<String, DistributionSummary> countMeters = new ConcurrentHashMap<>();
    private final Map<String, Timer> timeMeters = new ConcurrentHashMap<>();

    public QueryCountFilter(MeterRegistry registry, boolean detailEnabled, int warnThreshold,
                            List<String> ignoredPathPrefixes) {
        this.registry = registry;
        this.detailEnabled = detailEnabled;
        this.warnThreshold = warnThreshold;
        this.ignoredPathPrefixes = ignoredPathPrefixes;
    }

    /**
     * 액추에이터·Swagger 요청은 계측하지 않는다. perf 프로파일은 관리 포트를 메인 포트로
     * 되돌리기 때문에 Prometheus 스크레이프가 이 필터를 그대로 통과한다. 쿼리를 만들지
     * 않으면서 시계열만 늘리므로 제외한다.
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return ignoredPathPrefixes.stream().anyMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        QueryCountContext.begin(detailEnabled);
        try {
            chain.doFilter(request, response);
        } finally {
            // 예외로 빠져나가는 요청도 DB 부하는 이미 발생했으므로 반드시 기록한다.
            // 여기서 end()를 놓치면 누적기가 스레드에 남아 다음 요청에 섞인다.
            QueryCountRecorder recorder = QueryCountContext.end();
            if (recorder != null) {
                publish(request, recorder);
            }
        }
    }

    private void publish(HttpServletRequest request, QueryCountRecorder recorder) {
        /*
         * BEST_MATCHING_PATTERN은 DispatcherServlet이 핸들러를 고르면서 넣어 둔 URI
         * 템플릿("/api/posts/{id}/comments")이다. 실제 경로 대신 이 값을 태그로 쓰는
         * 이유는 두 가지다. 첫째, 게시물 ID마다 시계열이 생기는 것을 막는다. 둘째,
         * Micrometer의 http.server.requests가 쓰는 uri 라벨과 같은 값이라 PromQL에서
         * 두 지표를 조인할 수 있다.
         */
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String uri = pattern instanceof String s ? s : UNKNOWN_URI;
        String method = request.getMethod();
        String key = method + " " + uri;

        countMeter(key, uri, method).record(recorder.statements());
        timeMeter(key, uri, method).record(recorder.dbTimeNanos(), TimeUnit.NANOSECONDS);

        if (warnThreshold >= 0 && recorder.statements() >= warnThreshold) {
            logHeavyRequest(uri, method, recorder);
        }
    }

    private void logHeavyRequest(String uri, String method, QueryCountRecorder recorder) {
        if (detailEnabled) {
            log.warn("[QueryCount] uri={} method={} queries={} roundTrips={} distinct={} dbMs={} top=[{}]",
                    uri, method, recorder.statements(), recorder.roundTrips(),
                    recorder.distinctSql(), recorder.dbTimeMillis(), recorder.topSql(TOP_SQL_IN_LOG));
        } else {
            log.warn("[QueryCount] uri={} method={} queries={} roundTrips={} dbMs={}",
                    uri, method, recorder.statements(), recorder.roundTrips(), recorder.dbTimeMillis());
        }
    }

    private DistributionSummary countMeter(String key, String uri, String method) {
        return countMeters.computeIfAbsent(key, k -> DistributionSummary.builder("http.server.queries")
                .description("Number of SQL statements executed while serving one HTTP request")
                .tag("uri", uri)
                .tag("method", method)
                .serviceLevelObjectives(QUERY_COUNT_BUCKETS)
                .register(registry));
    }

    private Timer timeMeter(String key, String uri, String method) {
        return timeMeters.computeIfAbsent(key, k -> Timer.builder("http.server.query.time")
                .description("Time spent executing SQL statements while serving one HTTP request")
                .tag("uri", uri)
                .tag("method", method)
                .register(registry));
    }
}
