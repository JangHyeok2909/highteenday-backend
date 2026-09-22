package com.example.highteenday_backend.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Redis 접근이 실패해 폴백으로 넘어간 횟수를 메서드별로, 그리고 실패한 이유별로 센다.
 *
 * <p>폴백은 예외를 삼키고 기본값을 돌려주므로 응답은 HTTP 200 으로 나가고 오류율은 0 에
 * 가깝게 유지된다. 그래서 폴백이 몇 번 돌았는지는 응답이나 오류율로는 알 수 없다. 이 계측이
 * 없으면 유일한 흔적은 WARN 로그 한 줄인데, 장애 실험 보고서는 앱 로그를 수집하지 않는다.</p>
 *
 * <p>Prometheus 에는
 * {@code redis_fallback_total{method="RedisViewCountStore.incrementCount",reason="error"}}
 * 형태로 나간다. 태그 값은 폴백을 거는 메서드 수 × 이유 2 가지만큼만 생기므로 카디널리티가
 * 닫혀 있다.</p>
 *
 * <h2>{@code reason} 을 나누는 이유</h2>
 *
 * <p>{@code error} 는 Redis 에 호출을 보냈다가 실패한 것이고, {@code open} 은 서킷브레이커가
 * 열려 있어 호출을 보내지도 않고 거절한 것이다. 둘은 비용이 다르다. {@code error} 한 건에는
 * 명령 타임아웃({@code spring.data.redis.timeout}) 만큼의 스레드 대기가 붙지만
 * {@code open} 한 건은 거의 공짜다. 서킷이 아낀 대기 시간은 {@code open} 건수에 타임아웃을
 * 곱해야 나오므로, 합쳐 두면 그 값을 셀 수 없다.</p>
 *
 * <p>세는 것은 <b>Redis 접근 실패를 흡수한 횟수</b>다. Redis 가 성공적으로 빈 결과를 준 뒤
 * 호출자가 DB 를 다시 읽는 경로(예: 랭킹이 비어 DB 로 가는 경우)는 접근 실패가 아니므로
 * 여기서 세지 않는다.</p>
 */
@Component
public class RedisFallbackMetrics {

    private static final String METRIC = "redis.fallback";

    /** Redis 에 호출을 보냈다가 실패했다. */
    public static final String REASON_ERROR = "error";

    /** 서킷이 열려 있어 호출을 보내지 않고 거절했다. */
    public static final String REASON_OPEN = "open";

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
     *
     * <p>{@code error} 와 {@code open} 두 계열을 다 만든다. {@code open} 쪽을 빼면 "서킷이
     * 한 번도 열리지 않았다"와 "서킷 계측이 없다"가 같은 모양이 된다.</p>
     */
    public void register(String method) {
        counter(method, REASON_ERROR);
        counter(method, REASON_OPEN);
    }

    /**
     * Redis 접근 실패를 폴백으로 처리했을 때 부른다.
     *
     * @param reason {@link #REASON_ERROR} 또는 {@link #REASON_OPEN}.
     */
    public void recordFallback(String method, String reason) {
        counter(method, reason).increment();
    }

    private Counter counter(String method, String reason) {
        // 메서드 하나가 두 계열을 가지므로 맵 키도 둘을 합쳐 만든다.
        return counters.computeIfAbsent(method + "|" + reason, k -> Counter.builder(METRIC)
                .tag("method", method)
                .tag("reason", reason)
                .description("Redis 접근 실패를 폴백으로 처리한 횟수")
                .register(registry));
    }
}
