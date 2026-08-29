package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.metrics.QueryCountFilter;
import com.example.highteenday_backend.metrics.QueryCountListener;
import io.micrometer.core.instrument.FunctionCounter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

import java.util.List;
import java.util.concurrent.atomic.LongAdder;

/**
 * 엔드포인트별 "요청당 쿼리 수" 계측 구성.
 *
 * 구성 요소는 셋이다.
 * 1. {@link QueryCountListener} — p6spy가 문장 실행마다 호출한다. p6spy 스타터가
 *    JdbcEventListener 타입 빈을 자동으로 수집하므로 별도 등록 코드가 필요 없다.
 * 2. {@link QueryCountFilter}   — 요청 경계에서 누적기를 열고 닫으며 지표를 내보낸다.
 * 3. {@code db.queries.outside.request} 카운터 — 요청 밖에서 나간 문장 수.
 *
 * 설정
 * - app.query-metrics.enabled        전체 on/off. 끄면 리스너 빈 자체가 생기지 않아
 *                                    JDBC 경로에 아무 것도 붙지 않는다. 기본 on.
 * - app.query-metrics.detail-enabled SQL별 실행 횟수 집계와 로그의 top 항목.
 *                                    요청마다 맵을 하나 만드므로 dev·perf에서만 켠다.
 * - app.query-metrics.warn-threshold 이 값 이상 쿼리를 쓴 요청을 WARN 한 줄로 남긴다.
 *                                    -1이면 로그를 남기지 않는다.
 */
@Configuration
@ConditionalOnProperty(prefix = "app.query-metrics", name = "enabled", havingValue = "true", matchIfMissing = true)
public class QueryMetricsConfig {

    @Bean
    public QueryCountListener queryCountListener() {
        return new QueryCountListener();
    }

    /**
     * 요청 밖에서 실행된 문장 수를 지표로 노출한다.
     *
     * 이 값이 필요한 이유는 검산이다. 엔드포인트별 합계가 MySQL이 스스로 센
     * questions 와 맞아야 계측을 신뢰할 수 있는데, 스케줄러와 커넥션 검증 쿼리가
     * 그 차이를 만든다. 이 카운터가 그 몫을 설명한다.
     *
     * LongAdder를 그대로 읽는 FunctionCounter로 만든 이유는, 리스너가 DataSource
     * 생성 시점에 만들어지기 때문에 MeterRegistry를 직접 들고 있으면 지표 자동 구성과
     * 초기화 순서가 얽힐 수 있어서다. 리스너는 숫자만 쌓고, 노출은 여기서 한다.
     */
    @Bean
    public FunctionCounter outsideRequestQueryCounter(MeterRegistry registry, QueryCountListener listener) {
        return FunctionCounter.builder("db.queries.outside.request", listener.outsideRequestStatements(),
                        LongAdder::sum)
                .description("SQL statements not attributed to an endpoint (schedulers, pool validation, actuator)")
                .register(registry);
    }

    /**
     * 필터를 시큐리티 체인(기본 order -100)보다 바깥에 둔다. 인증 과정에서 나가는
     * 조회까지 요청 비용에 포함시키기 위해서다.
     */
    @Bean
    public FilterRegistrationBean<QueryCountFilter> queryCountFilterRegistration(
            MeterRegistry registry,
            @Value("${app.query-metrics.detail-enabled:false}") boolean detailEnabled,
            @Value("${app.query-metrics.warn-threshold:30}") int warnThreshold,
            @Value("${app.query-metrics.ignored-path-prefixes:/actuator,/swagger,/v3/api-docs}") List<String> ignoredPathPrefixes) {

        FilterRegistrationBean<QueryCountFilter> registration = new FilterRegistrationBean<>(
                new QueryCountFilter(registry, detailEnabled, warnThreshold, ignoredPathPrefixes));
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        registration.setName("queryCountFilter");
        return registration;
    }
}
