package com.example.highteenday_backend.aop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * {@link ResilientRedisAspect} 테스트.
 *
 * <p>최소 Spring 컨텍스트에서 CGLIB 프록시를 통해 advice 적용을 검증한다.
 * 실제 Redis 연결 없이, 메서드가 예외를 던지면 aspect가 이를 억제하고
 * 반환 타입에 맞는 기본값을 반환하는지 확인한다.</p>
 */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = {ResilientRedisAspectTest.TestConfig.class})
@DisplayName("ResilientRedisAspect")
class ResilientRedisAspectTest {

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
            throw new RuntimeException("Redis down");
        }

        @ResilientRedis
        public List<String> listOp() {
            throw new RuntimeException("Redis down");
        }

        @ResilientRedis
        public Set<String> setOp() {
            throw new RuntimeException("Redis down");
        }

        @ResilientRedis
        public Map<String, String> mapOp() {
            throw new RuntimeException("Redis down");
        }

        @ResilientRedis
        public boolean boolOp() {
            throw new RuntimeException("Redis down");
        }

        @ResilientRedis
        public int intOp() {
            throw new RuntimeException("Redis down");
        }

        @ResilientRedis
        public long longOp() {
            throw new RuntimeException("Redis down");
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
}
