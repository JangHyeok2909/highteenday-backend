package com.example.highteenday_backend;

import com.example.highteenday_backend.configs.TestFileStorageConfig;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

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

	@Test
	void contextLoads() {
	}

}
