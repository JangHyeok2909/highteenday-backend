package com.example.highteenday_backend.aop;

import com.example.highteenday_backend.metrics.RedisFallbackMetrics;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.RedisSystemException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link ResilientRedisExecutor} 테스트.
 *
 * <p>서킷이 <b>여는</b> 동작과 <b>거절하는</b> 동작을 본다. 폴백 값이 반환 타입에 맞게
 * 유도되는지는 {@link ResilientRedisAspectTest} 가 본다. 그쪽은 절대 열리지 않는 서킷을
 * 쓰므로 여기 있는 것들을 검증할 수 없다.</p>
 */
@DisplayName("ResilientRedisExecutor")
class ResilientRedisExecutorTest {

    private static final String METHOD = "SampleClient.op";

    private SimpleMeterRegistry meterRegistry;
    private CircuitBreakerRegistry circuitBreakerRegistry;
    private ResilientRedisExecutor executor;

    /** 실패 4건이면 열린다. 표본을 작게 잡아야 테스트가 짧게 끝난다. */
    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        circuitBreakerRegistry = CircuitBreakerRegistry.of(CircuitBreakerConfig.custom()
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                .slidingWindowSize(4)
                .minimumNumberOfCalls(4)
                .failureRateThreshold(50)
                .waitDurationInOpenState(Duration.ofSeconds(30))
                .automaticTransitionFromOpenToHalfOpenEnabled(false)
                // 운영 설정과 같은 타입. executor 의 catch 절과 같아야 한다.
                .recordExceptions(DataAccessException.class)
                .build());
        circuitBreakerRegistry.circuitBreaker("redis");
        executor = new ResilientRedisExecutor(circuitBreakerRegistry, new RedisFallbackMetrics(meterRegistry));
    }

    private double count(String reason) {
        Counter c = meterRegistry.find("redis.fallback").tag("method", METHOD).tag("reason", reason).counter();
        return c == null ? -1 : c.count();
    }

    private static RuntimeException redisDown() {
        return new RedisConnectionFailureException("Unable to connect to Redis");
    }

    @Nested
    @DisplayName("설정 연결")
    class Wiring {

        @Test
        @DisplayName("설정에 redis 인스턴스가 없으면 기동을 멈춘다")
        void failsFastWhenInstanceIsMissing() {
            // 레지스트리는 없는 이름을 요청받으면 기본 설정 서킷을 조용히 만든다. 그러면
            // sliding window 100, 대기 60초짜리 다른 서킷이 쓰이는데 오류가 안 나므로,
            // 장애 실험을 돌려 보기 전까지 아무도 모른다.
            CircuitBreakerRegistry empty = CircuitBreakerRegistry.ofDefaults();

            assertThatThrownBy(() -> new ResilientRedisExecutor(empty, new RedisFallbackMetrics(meterRegistry)))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("instances.redis");
        }

        @Test
        @DisplayName("운영 설정의 record-exceptions 가 executor 의 catch 절과 같다")
        void productionRecordExceptionsMatchesTheCatchClause() throws IOException {
            // 둘이 갈리면 폴백은 도는데 실패율이 안 올라 서킷이 끝내 안 열린다. 그 상태는
            // 오류도 로그도 남기지 않으므로, 여기서 막지 않으면 장애가 나서야 드러난다.
            String properties = Files.readString(
                    Path.of("src/main/resources/application.properties"), StandardCharsets.UTF_8);

            assertThat(properties)
                    .as("executor 는 DataAccessException 을 잡는다. 서킷도 같은 타입을 실패로 세야 한다")
                    .contains("resilience4j.circuitbreaker.instances.redis.record-exceptions="
                            + "org.springframework.dao.DataAccessException");
        }
    }

    @Nested
    @DisplayName("서킷이 닫혀 있을 때")
    class Closed {

        @Test
        @DisplayName("Redis 실패를 폴백으로 바꾸고 error 로 센다")
        void recordsErrorAndFallsBack() {
            String result = executor.execute(METHOD, () -> { throw redisDown(); }, () -> "fallback");

            assertThat(result).isEqualTo("fallback");
            assertThat(count("error")).isEqualTo(1.0);
            assertThat(count("open")).isEqualTo(0.0);
        }

        @Test
        @DisplayName("성공해도 두 계열을 0 으로 만들어 둔다")
        void registersBothZeroSeriesOnSuccess() {
            executor.execute(METHOD, () -> "ok", () -> "fallback");

            assertThat(count("error"))
                    .as("시계열이 없으면 '폴백 0 회'와 '계측 없음'을 구분할 수 없다")
                    .isEqualTo(0.0);
            assertThat(count("open"))
                    .as("open 계열이 없으면 '서킷이 한 번도 안 열렸다'와 '서킷 계측이 없다'가 같아 보인다")
                    .isEqualTo(0.0);
        }

        @Test
        @DisplayName("Redis 실패가 아닌 예외는 그대로 던지고 세지 않는다")
        void propagatesCodeBugs() {
            assertThatThrownBy(() -> executor.execute(METHOD,
                    () -> { throw new NullPointerException("code bug"); }, () -> "fallback"))
                    .isInstanceOf(NullPointerException.class);

            assertThat(count("error")).isEqualTo(0.0);
        }
    }

    @Nested
    @DisplayName("서킷이 열린 뒤")
    class Opened {

        /** 실패 4건으로 창을 채워 서킷을 연다. */
        private void openCircuit() {
            for (int i = 0; i < 4; i++) {
                executor.execute(METHOD, () -> { throw redisDown(); }, () -> "fallback");
            }
        }

        @Test
        @DisplayName("Redis 를 부르지 않고 폴백을 돌려주며 open 으로 센다")
        void rejectsWithoutCallingRedis() {
            openCircuit();
            assertThat(circuitBreakerRegistry.circuitBreaker("redis").getState())
                    .isEqualTo(CircuitBreaker.State.OPEN);

            AtomicInteger calls = new AtomicInteger();
            String result = executor.execute(METHOD, () -> {
                calls.incrementAndGet();
                throw redisDown();
            }, () -> "fallback");

            assertThat(result).isEqualTo("fallback");
            assertThat(calls.get())
                    .as("호출이 나가면 명령 타임아웃만큼 스레드가 묶인다 — 서킷을 넣은 이유가 사라진다")
                    .isZero();
            assertThat(count("open")).isEqualTo(1.0);
            assertThat(count("error"))
                    .as("Redis 에 가지 않았으므로 접근 실패 4건에서 늘면 안 된다")
                    .isEqualTo(4.0);
        }

        @Test
        @DisplayName("isOpen 이 true 가 되고, 확인해도 half-open 탐침을 소모하지 않는다")
        void isOpenReadsStateWithoutConsumingPermits() {
            openCircuit();

            assertThat(executor.isOpen()).isTrue();
            assertThat(executor.isOpen()).isTrue();

            assertThat(circuitBreakerRegistry.circuitBreaker("redis").getState())
                    .as("상태를 읽는 것만으로 전이가 일어나면 안 된다")
                    .isEqualTo(CircuitBreaker.State.OPEN);
        }
    }

    @Nested
    @DisplayName("실패로 셀 예외의 범위")
    class RecordedExceptions {

        /**
         * Lettuce 의 순수 {@code RedisException}("Connection closed prematurely" 등)은
         * {@link RedisSystemException} 으로 변환된다. 예전 설정은
         * {@code RedisConnectionFailureException} 과 {@code QueryTimeoutException} 둘만
         * 실패로 셌기 때문에 이 타입이 성공으로 집계됐고, 서킷이 필요한 장애에서 서킷이
         * 닫힌 채로 남았다.
         */
        @Test
        @DisplayName("RedisSystemException 도 서킷을 여는 데 쓰인다")
        void countsUncategorizedRedisFailures() {
            for (int i = 0; i < 4; i++) {
                executor.execute(METHOD,
                        () -> { throw new RedisSystemException("Connection closed prematurely", new RuntimeException()); },
                        () -> "fallback");
            }

            assertThat(executor.isOpen())
                    .as("폴백이 돌았는데 서킷이 안 열리면 모든 호출이 계속 타임아웃을 기다린다")
                    .isTrue();
        }
    }

    @Nested
    @DisplayName("executeChecked")
    class Checked {

        @Test
        @DisplayName("Redis 실패는 폴백으로, 그 밖의 Throwable 은 그대로 올린다")
        void handlesCheckedSuppliers() throws Throwable {
            assertThat(executor.<String>executeChecked(METHOD, () -> { throw redisDown(); }, () -> "fallback"))
                    .isEqualTo("fallback");

            assertThatThrownBy(() -> executor.executeChecked(METHOD,
                    () -> { throw new IOException("not a Redis failure"); }, () -> "fallback"))
                    .isInstanceOf(IOException.class);
        }
    }
}
