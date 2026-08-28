package com.example.highteenday_backend.support;

import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.annotation.AliasFor;
import org.springframework.test.context.ActiveProfiles;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 컨트롤러 한 개만 띄우는 웹 슬라이스 테스트 (docs/KNOWN-ISSUES.md KI-52).
 *
 * 무엇을 고정하는가: 요청 매핑, 경로/쿼리 파라미터 바인딩, 요청 본문 검증,
 * 응답 직렬화, 그리고 그 엔드포인트에 걸린 인가 규칙. 서비스 계층은
 * {@code @MockitoBean} 으로 대체하므로 DB 도 Redis 도 필요 없다.
 *
 * 사용법:
 * <pre>
 * &#64;WebSliceTest(PostController.class)
 * class PostControllerWebSliceTest {
 *     &#64;Autowired MockMvc mockMvc;
 *     &#64;MockitoBean PostService postService;
 * }
 * </pre>
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@WebMvcTest
@ActiveProfiles("test")
@Import({ com.example.highteenday_backend.security.SecurityConfig.class, WebSliceSecuritySupport.class })
public @interface WebSliceTest {

    /** 슬라이스에 올릴 컨트롤러. 비우면 모든 컨트롤러가 올라와 목이 많이 필요해진다. */
    @AliasFor(annotation = WebMvcTest.class, attribute = "controllers")
    Class<?>[] value() default {};
}
