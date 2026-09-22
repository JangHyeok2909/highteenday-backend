package com.example.highteenday_backend;

import com.example.highteenday_backend.configs.TestFileStorageConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.test.context.ActiveProfiles;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 전체 스프링 컨텍스트가 뜨는지 확인한다. 빈 배선이 깨지면 여기서 잡힌다.
 *
 * test 프로파일은 H2와 자리채우기 설정을 쓴다(application-test.properties).
 * S3Config / S3FileStorageAdapter 는 @Profile("!test") 라 빠지고,
 * 그 자리를 TestFileStorageConfig 의 LocalFileStorageAdapter 가 채운다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestFileStorageConfig.class)
class HighteendayBackendApplicationTests {

	@Autowired
	CircuitBreakerRegistry circuitBreakerRegistry;

	@Test
	void contextLoads() {
	}

	/**
	 * Redis 서킷이 application.properties 의 값으로 만들어졌는지 확인한다.
	 *
	 * <p>이름이 어긋났을 때가 가장 알아채기 어렵다. 레지스트리는 없는 이름을 요청받으면
	 * 기본 설정(창 100회, 대기 60초, 모든 예외를 실패로 집계) 서킷을 조용히 만들고 오류를
	 * 내지 않는다. {@code ResilientRedisExecutor} 가 기동 때 막지만, 여기서 값까지 확인해야
	 * 설정이 기본값으로 되돌아간 것을 잡을 수 있다.</p>
	 */
	@Test
	void redisCircuitBreakerUsesConfiguredValues() {
		CircuitBreakerConfig config = circuitBreakerRegistry.circuitBreaker("redis").getCircuitBreakerConfig();

		assertThat(config.getSlidingWindowType())
				.as("호출 수로 재면 창이 0.15초 분량이라 짧은 지연에도 서킷이 열린다")
				.isEqualTo(CircuitBreakerConfig.SlidingWindowType.TIME_BASED);
		assertThat(config.getSlidingWindowSize()).isEqualTo(10);
		assertThat(config.getMinimumNumberOfCalls()).isEqualTo(20);
		assertThat(config.getFailureRateThreshold()).isEqualTo(50f);
		assertThat(config.getWaitIntervalFunctionInOpenState().apply(1))
				.isEqualTo(Duration.ofSeconds(5).toMillis());
		assertThat(config.getPermittedNumberOfCallsInHalfOpenState()).isEqualTo(3);

		// 폴백이 도는 예외와 서킷이 실패로 세는 예외가 갈리면, 폴백은 도는데 실패율이 안 올라
		// 서킷이 끝내 안 열린다. ResilientRedisExecutor 의 catch 절과 같은 타입이어야 한다.
		assertThat(config.getRecordExceptionPredicate().test(new DataAccessException("redis down") {}))
				.as("executor 가 폴백으로 처리하는 예외는 서킷도 실패로 세야 한다")
				.isTrue();
		assertThat(config.getRecordExceptionPredicate().test(new IllegalStateException("code bug")))
				.as("Redis 와 무관한 예외로 서킷이 열리면 안 된다")
				.isFalse();
	}

	@Test
	void redisCircuitBreakerStartsClosed() {
		assertThat(circuitBreakerRegistry.circuitBreaker("redis").getState())
				.isEqualTo(CircuitBreaker.State.CLOSED);
	}

}
