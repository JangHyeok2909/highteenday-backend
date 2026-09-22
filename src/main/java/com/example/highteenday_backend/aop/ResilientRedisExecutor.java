package com.example.highteenday_backend.aop;

import com.example.highteenday_backend.metrics.RedisFallbackMetrics;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.github.resilience4j.core.functions.CheckedSupplier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

/**
 * Redis 호출을 서킷브레이커에 태우고, 실패하면 폴백 값을 돌려주며 그 횟수를 센다.
 *
 * <p>서킷이 없을 때는 Redis 가 죽어 있어도 호출이 매번 Redis 로 나갔다.
 * {@code spring.data.redis.timeout=100ms} 이므로 응답이 오지 않는 유형의 장애에서는 호출
 * 하나가 100ms 동안 Tomcat 스레드를 붙잡고 있다가 실패했다. 서킷이 OPEN 이면 호출을 보내지
 * 않고 즉시 폴백으로 넘어가므로 그 대기가 사라진다.</p>
 *
 * <p>서킷이 실패로 세는 예외와 이 클래스가 폴백으로 처리하는 예외는 <b>같아야 한다.</b>
 * Resilience4j 는 {@code record-exceptions} 에 없는 예외를 성공으로 세기 때문에, 두 집합이
 * 갈리면 폴백은 도는데 실패율이 오르지 않아 서킷이 끝내 열리지 않는 구간이 생긴다. 그래서
 * {@code application.properties} 의 {@code record-exceptions} 를 아래 catch 절과 같은
 * {@link DataAccessException} 한 줄로 맞춰 두었다. 둘 중 하나를 고치면 다른 하나도 고친다.</p>
 *
 * <p>{@link CircuitBreaker} 인스턴스는 애플리케이션 전체가 하나를 공유한다. Redis 는 프로세스
 * 하나이므로, 어떤 메서드가 실패했다는 사실은 다른 메서드에도 그대로 적용된다.</p>
 */
@Slf4j
@Component
public class ResilientRedisExecutor {

    /** {@code resilience4j.circuitbreaker.instances.<이름>} 의 이름과 같아야 한다. */
    private static final String INSTANCE_NAME = "redis";

    private final CircuitBreaker circuitBreaker;
    private final RedisFallbackMetrics fallbackMetrics;

    /**
     * @throws IllegalStateException 설정에 {@code redis} 인스턴스가 없는 경우.
     */
    public ResilientRedisExecutor(CircuitBreakerRegistry registry, RedisFallbackMetrics fallbackMetrics) {
        // 레지스트리는 없는 이름을 요청받으면 기본 설정으로 새로 만들고 오류를 내지 않는다.
        // 설정 키의 이름이 한 글자만 어긋나도 sliding window 100, 대기 60초짜리 다른 서킷이
        // 조용히 쓰이므로, 기동 때 잡지 않으면 장애 실험에서야 드러난다.
        boolean configured = registry.getAllCircuitBreakers().stream()
                .anyMatch(cb -> INSTANCE_NAME.equals(cb.getName()));
        if (!configured) {
            throw new IllegalStateException(
                    "resilience4j.circuitbreaker.instances." + INSTANCE_NAME + " 설정을 찾지 못했다");
        }
        this.circuitBreaker = registry.circuitBreaker(INSTANCE_NAME);
        this.fallbackMetrics = fallbackMetrics;
    }

    /**
     * Redis 호출을 서킷을 거쳐 실행하고, 실패하면 {@code fallback} 의 값을 돌려준다.
     *
     * <p>{@link DataAccessException} 이 아닌 예외는 잡지 않는다. NPE 같은 코드 오류를 Redis
     * 장애로 위장시키면 응답이 200 으로 나가 버려서 버그를 찾을 단서가 사라진다.</p>
     *
     * @param method 폴백 카운터의 {@code method} 태그 값. {@code <클래스>.<메서드>} 형식을 쓴다.
     * @param call Redis 를 호출하는 코드. <b>DB 호출을 섞지 않는다</b> — 섞으면 MySQL 실패가
     *             Redis 서킷을 열고, 그러면 캐시가 꺼져 부하가 MySQL 로 더 몰린다.
     * @param fallback Redis 를 쓰지 못할 때 대신 돌려줄 값.
     */
    public <T> T execute(String method, Supplier<T> call, Supplier<T> fallback) {
        fallbackMetrics.register(method);
        try {
            return circuitBreaker.executeSupplier(call);
        } catch (CallNotPermittedException e) {
            return rejected(method, fallback);
        } catch (DataAccessException e) {
            return failed(method, e, fallback);
        }
    }

    /**
     * {@link ResilientRedisAspect} 전용. {@code ProceedingJoinPoint.proceed()} 가
     * {@link Throwable} 을 던져서 {@link Supplier} 로는 받을 수 없기 때문에 따로 둔다.
     * 나머지 동작은 {@link #execute}와 같다.
     *
     * @throws Throwable {@link DataAccessException} 이 아닌 예외를 원래 메서드가 던진 경우.
     */
    public <T> T executeChecked(String method, CheckedSupplier<T> call, Supplier<T> fallback) throws Throwable {
        fallbackMetrics.register(method);
        try {
            return circuitBreaker.executeCheckedSupplier(call);
        } catch (CallNotPermittedException e) {
            return rejected(method, fallback);
        } catch (DataAccessException e) {
            return failed(method, e, fallback);
        }
    }

    /**
     * 서킷이 열려 있는지 읽는다. <b>호출 결과를 서킷 통계에 넣지 않는다.</b>
     *
     * <p>Redis 호출과 DB 호출이 한 메서드 안에 섞여 있어 {@link #execute} 로 감쌀 수 없는
     * 경로가 쓴다. 예외 하나만 봐서는 Redis 가 실패한 것인지 MySQL 이 실패한 것인지 가릴 수
     * 없으므로, 그런 경로는 서킷의 판단을 읽기만 하고 판단에 참여하지는 않는다.</p>
     *
     * <p>권한을 소모하는 {@code tryAcquirePermission()} 대신 상태만 읽는다. half-open 에서
     * 허용된 탐침 횟수를 이 확인이 써 버리면 서킷이 회복을 판정할 표본을 잃는다.</p>
     */
    public boolean isOpen() {
        return circuitBreaker.getState() == CircuitBreaker.State.OPEN;
    }

    /** 서킷이 거절해 Redis 에 가지도 않은 경우. */
    private <T> T rejected(String method, Supplier<T> fallback) {
        fallbackMetrics.recordFallback(method, RedisFallbackMetrics.REASON_OPEN);
        log.warn("Redis circuit is OPEN, skipping {} without calling Redis", method);
        return fallback.get();
    }

    /** Redis 에 갔다가 실패한 경우. */
    private <T> T failed(String method, DataAccessException e, Supplier<T> fallback) {
        fallbackMetrics.recordFallback(method, RedisFallbackMetrics.REASON_ERROR);
        // 리프레시 토큰이 인자로 들어오는 메서드가 있으므로 인자는 로그에 남기지 않는다.
        log.warn("Redis unavailable, falling back for {}. cause={}: {}",
                method, e.getClass().getSimpleName(), e.getMostSpecificCause().getMessage());
        return fallback.get();
    }
}
