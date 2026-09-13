package com.example.highteenday_backend.aop;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.example.highteenday_backend.metrics.RedisFallbackMetrics;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link ResilientRedisAspect} 테스트.
 *
 * <p>최소 Spring 컨텍스트에서 CGLIB 프록시를 통해 advice 적용을 검증한다.
 * 실제 Redis 연결 없이, 메서드가 Redis 장애 예외를 던지면 aspect가 이를 억제하고
 * 반환 타입에 맞는 기본값을 반환하는지 확인한다.</p>
 *
 * <p>장애 시뮬레이션에 {@link RedisConnectionFailureException} 을 쓰는 이유:
 * aspect는 {@code DataAccessException} 계열만 잡는다. 예전 테스트는
 * 평범한 {@code RuntimeException} 을 던져 "Redis 장애"라고 불렀는데, 그건 실제
 * 스프링 데이터 Redis 가 내는 타입이 아니라 코드 버그와 구분되지 않는 타입이었다.</p>
 */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = {ResilientRedisAspectTest.TestConfig.class})
@DisplayName("ResilientRedisAspect")
class ResilientRedisAspectTest {

    /** 실제 Redis 장애가 났을 때 스프링이 던지는 타입. */
    private static RuntimeException redisDown() {
        return new RedisConnectionFailureException("Unable to connect to Redis");
    }

    @Configuration
    @EnableAspectJAutoProxy
    static class TestConfig {
        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }

        @Bean
        RedisFallbackMetrics redisFallbackMetrics(MeterRegistry registry) {
            return new RedisFallbackMetrics(registry);
        }

        @Bean
        ResilientRedisAspect resilientRedisAspect(RedisFallbackMetrics metrics) {
            return new ResilientRedisAspect(metrics);
        }

        @Bean
        SampleRedisClient sampleRedisClient() {
            return new SampleRedisClient();
        }
    }

    static class SampleRedisClient {
        @ResilientRedis
        public void voidOp() {
            throw redisDown();
        }

        @ResilientRedis
        public List<String> listOp() {
            throw redisDown();
        }

        @ResilientRedis
        public Set<String> setOp() {
            throw redisDown();
        }

        @ResilientRedis
        public Map<String, String> mapOp() {
            throw redisDown();
        }

        @ResilientRedis
        public boolean boolOp() {
            throw redisDown();
        }

        @ResilientRedis
        public int intOp() {
            throw redisDown();
        }

        @ResilientRedis
        public long longOp() {
            throw redisDown();
        }

        /** 토큰 원문처럼 민감한 값을 인자로 받는 메서드. */
        @ResilientRedis
        public void putToken(String refreshToken, String email) {
            throw redisDown();
        }

        /** Redis 장애가 아니라 코드 버그. */
        @ResilientRedis
        public void bugOp() {
            throw new NullPointerException("this is a code bug, not Redis");
        }

        /** 정상 동작. 폴백이 안 돌아도 시계열이 생기는지 확인하는 데 쓴다. */
        @ResilientRedis
        public int okOp() {
            return 7;
        }

        /**
         * 카운터 증가 검증 전용.
         *
         * <p>Spring 테스트 컨텍스트는 클래스 안에서 재사용되므로 카운터 값이 테스트 사이에
         * 누적된다. 다른 테스트가 부르는 메서드를 쓰면 기대값이 실행 순서에 따라 달라지므로
         * 이 메서드는 카운터 테스트만 부른다.</p>
         */
        @ResilientRedis
        public List<String> countedOp() {
            throw redisDown();
        }
    }

    @Autowired
    SampleRedisClient client;

    @Autowired
    MeterRegistry registry;

    private double fallbackCount(String method) {
        io.micrometer.core.instrument.Counter c = registry.find("redis.fallback").tag("method", method).counter();
        return c == null ? -1 : c.count();
    }

    @Nested
    @DisplayName("void 메서드")
    class VoidMethod {

        @Test
        @DisplayName("예외를 억제하고 정상 종료한다")
        void suppressesException() {
            assertThatCode(() -> client.voidOp())
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("컬렉션 반환 메서드")
    class CollectionReturn {

        @Test
        @DisplayName("List 반환 시 빈 리스트를 반환한다")
        void returnsEmptyList() {
            assertThat(client.listOp()).isEmpty();
        }

        @Test
        @DisplayName("Set 반환 시 빈 셋을 반환한다")
        void returnsEmptySet() {
            assertThat(client.setOp()).isEmpty();
        }

        @Test
        @DisplayName("Map 반환 시 빈 맵을 반환한다")
        void returnsEmptyMap() {
            assertThat(client.mapOp()).isEmpty();
        }
    }

    @Nested
    @DisplayName("원시 타입 반환 메서드")
    class PrimitiveReturn {

        @Test
        @DisplayName("boolean 반환 시 false를 반환한다")
        void returnsFalse() {
            assertThat(client.boolOp()).isFalse();
        }

        @Test
        @DisplayName("int 반환 시 0을 반환한다")
        void returnsZeroInt() {
            assertThat(client.intOp()).isEqualTo(0);
        }

        @Test
        @DisplayName("long 반환 시 0L을 반환한다")
        void returnsZeroLong() {
            assertThat(client.longOp()).isEqualTo(0L);
        }
    }

    /** Redis 예외 범위의 회귀를 방지한다. */
    @Nested
    @DisplayName("장애 로그와 예외 범위")
    class FailureHandling {

        private ListAppender<ILoggingEvent> appender;
        private Logger aspectLogger;

        @BeforeEach
        void attachAppender() {
            aspectLogger = (Logger) LoggerFactory.getLogger(ResilientRedisAspect.class);
            appender = new ListAppender<>();
            appender.start();
            aspectLogger.addAppender(appender);
            aspectLogger.setLevel(Level.WARN);
        }

        @AfterEach
        void detachAppender() {
            aspectLogger.detachAppender(appender);
        }

        private String loggedText() {
            return appender.list.stream()
                    .map(ILoggingEvent::getFormattedMessage)
                    .reduce("", (a, b) -> a + "\n" + b);
        }

        @Test
        @DisplayName("메서드 인자를 로그에 남기지 않는다 — 리프레시 토큰 평문 유출 방지")
        void doesNotLogArguments() {
            String refreshToken = "super-secret-refresh-token-value";

            client.putToken(refreshToken, "victim@example.com");

            String logged = loggedText();
            assertThat(logged)
                    .as("장애 로그에 인자가 실리면 토큰 원문이 로그 파일에 남는다")
                    .doesNotContain(refreshToken)
                    .doesNotContain("victim@example.com");
            assertThat(logged)
                    .as("원인 파악에 필요한 메서드 이름은 남아야 한다")
                    .contains("putToken");
        }

        @Test
        @DisplayName("Redis 장애가 아닌 코드 버그는 삼키지 않고 그대로 던진다")
        void doesNotSwallowCodeBugs() {
            assertThatThrownBy(() -> client.bugOp())
                    .as("NPE 를 'Redis unavailable' 로 위장하면 버그가 영영 안 보인다")
                    .isInstanceOf(NullPointerException.class);

            assertThat(loggedText()).doesNotContain("Redis unavailable");
        }
    }

    /**
     * 폴백은 예외를 삼키고 200 을 내보내므로 오류율에 흔적이 없다. 카운터가 유일한 흔적이다.
     */
    @Nested
    @DisplayName("폴백 계측")
    class FallbackMetrics {

        @Test
        @DisplayName("폴백이 돌면 그 메서드의 카운터가 오른다")
        void countsFallback() {
            client.countedOp();
            client.countedOp();

            assertThat(fallbackCount("SampleRedisClient.countedOp"))
                    .as("흡수한 실패 2건이 세어져야 한다")
                    .isEqualTo(2.0);
        }

        @Test
        @DisplayName("폴백이 안 돌아도 시계열은 0 으로 존재한다")
        void registersZeroSeriesOnSuccess() {
            client.okOp();

            assertThat(fallbackCount("SampleRedisClient.okOp"))
                    .as("시계열이 없으면 읽는 쪽에서 '0 회'와 '계측 없음'을 구분할 수 없다")
                    .isEqualTo(0.0);
        }

        @Test
        @DisplayName("코드 버그는 폴백이 아니므로 세지 않는다")
        void doesNotCountCodeBugs() {
            assertThatThrownBy(() -> client.bugOp()).isInstanceOf(NullPointerException.class);

            assertThat(fallbackCount("SampleRedisClient.bugOp"))
                    .as("버그를 폴백으로 세면 Redis 장애 건수가 부풀려진다")
                    .isEqualTo(0.0);
        }
    }
}
