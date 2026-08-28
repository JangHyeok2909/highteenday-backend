package com.example.highteenday_backend.configs;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * JPA 감사(BaseEntity 의 created / updatedDate 자동 채움) 활성화.
 *
 * 왜 애플리케이션 클래스가 아니라 여기 있는가: {@code @EnableJpaAuditing} 이
 * {@code @SpringBootApplication} 클래스에 붙어 있으면, JPA 를 뺀 슬라이스 테스트
 * ({@code @WebMvcTest}) 에서도 이 애노테이션이 항상 처리되어
 * "JPA metamodel must not be empty" 로 컨텍스트가 뜨지 않는다. 별도 설정 클래스로
 * 빼면 슬라이스의 타입 필터가 걸러 주므로 웹 계층만 띄울 수 있다
 * (docs/KNOWN-ISSUES.md KI-52).
 */
@Configuration
@EnableJpaAuditing
public class JpaAuditingConfig {
}
