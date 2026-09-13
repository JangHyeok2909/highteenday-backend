package com.example.highteenday_backend.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Redis 접근이 실패해 폴백으로 넘어간 횟수를 메서드별로 센다.
 *
 * <p>폴백은 예외를 삼키고 기본값을 돌려주므로 응답은 HTTP 200 으로 나가고 오류율은 0 에
 * 가깝게 유지된다. 그래서 폴백이 몇 번 돌았는지는 응답이나 오류율로는 알 수 없다. 이 계측이
 * 없으면 유일한 흔적은 WARN 로그 한 줄인데, 장애 실험 보고서는 앱 로그를 수집하지 않는다.</p>
 *
 * <p>Prometheus 에는 {@code redis_fallback_total{method="RedisViewCountStore.incrementCount"}}
 * 형태로 나간다. 태그 값은 폴백을 거는 메서드 수만큼만 생기므로 카디널리티가 닫혀 있다.</p>
 *
 * <p>세는 것은 <b>Redis 접근 실패를 흡수한 횟수</b>다. Redis 가 성공적으로 빈 결과를 준 뒤
 * 호출자가 DB 를 다시 읽는 경로(예: 랭킹이 비어 DB 로 가는 경우)는 접근 실패가 아니므로
 * 여기서 세지 않는다.</p>
 */
@Component
public class RedisFallbackMetrics {

    private static final String METRIC = "redis.fallback";

    private final MeterRegistry registry;
    private final Map<String, Counter> counters = new ConcurrentHashMap<>();

    public RedisFallbackMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    /**
     * 폴백이 걸린 메서드가 호출될 때마다 부른다. 실패하지 않아도 부른다.
     *
     * <p>실패했을 때만 만들면 폴백이 한 번도 안 돈 구간에는 시계열이 아예 없고, 수집 쪽에서
     * "폴백 0 회"와 "계측이 없거나 수집이 실패함"이 구분되지 않는다. 장애 전 구간에 0 이
     * 찍혀 있어야 장애 구간의 값을 비교할 기준이 생긴다.</p>
     */
    public void register(String method) {
        counter(method);
    }

    /** Redis 접근 실패를 폴백으로 처리했을 때 부른다. */
    public void recordFallback(String method) {
        counter(method).increment();
    }

    private Counter counter(String method) {
        return counters.computeIfAbsent(method, m -> Counter.builder(METRIC)
                .tag("method", m)
                .description("Redis 접근 실패를 폴백으로 처리한 횟수")
                .register(registry));
    }
}
