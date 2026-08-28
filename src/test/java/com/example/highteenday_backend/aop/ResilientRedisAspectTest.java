package com.example.highteenday_backend.aop;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
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
 * aspect 는 {@code DataAccessException} 계열만 잡는다(KI-18). 예전 테스트는
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
        ResilientRedisAspect resilientRedisAspect() {
            return new ResilientRedisAspect();
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
    }

    @Autowired
    SampleRedisClient client;

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

    /** KI-18 회귀 방지. */
    @Nested
    @DisplayName("장애 로그와 예외 범위 (KI-18)")
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
}
