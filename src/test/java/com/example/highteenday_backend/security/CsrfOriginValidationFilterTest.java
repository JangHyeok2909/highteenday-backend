package com.example.highteenday_backend.security;

import com.example.highteenday_backend.configs.TestFileStorageConfig;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.ActiveProfiles;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 교차 출처 쓰기 차단 (docs/KNOWN-ISSUES.md KI-06).
 *
 * <p>쿠키 인증 + {@code SameSite=None} + CSRF 비활성 조합이라, 공격자 페이지가 사용자의
 * 브라우저로 쓰기 요청을 대신 보낼 수 있었다. 브라우저가 교차 출처 쓰기에 반드시 붙이는
 * {@code Origin} 을 검사해 막는다.
 *
 * <p><b>필터를 직접 호출해 검사하는 이유</b>: MockMvc 로 실제 요청을 보내면 스프링의
 * CORS 필터가 먼저 낯선 Origin 을 403 으로 끊어 버린다. 그러면 이 필터를 지워도 테스트가
 * 통과해 회귀를 못 잡는다. 그래서 판정 로직은 필터를 직접 불러 확인하고, "그 필터가 실제
 * 체인에 등록돼 있는가"는 아래 {@link Wiring} 에서 따로 본다.
 */
class CsrfOriginValidationFilterTest {

    private static final String ALLOWED_ORIGIN = "https://www.highteenday.org";
    private static final String ATTACKER_ORIGIN = "https://evil.example.com";

    private final CsrfOriginValidationFilter filter =
            new CsrfOriginValidationFilter(List.of(ALLOWED_ORIGIN));

    /** 필터를 한 번 태우고 (통과 여부, 응답 상태) 를 돌려준다. */
    private record Result(boolean passedThrough, int status) { }

    private Result run(String method, String uri, String originHeader, String refererHeader)
            throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setScheme("https");
        request.setServerName("api.highteenday.org");
        request.setServerPort(443);
        if (originHeader != null) request.addHeader("Origin", originHeader);
        if (refererHeader != null) request.addHeader("Referer", refererHeader);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        return new Result(chain.getRequest() != null, response.getStatus());
    }

    @Nested
    @DisplayName("쓰기 요청")
    class WriteRequests {

        @Test
        @DisplayName("허용되지 않은 출처의 쓰기는 403 으로 끊고 뒤로 넘기지 않는다")
        void blocksForeignOrigin() throws Exception {
            Result result = run("POST", "/api/posts", ATTACKER_ORIGIN, null);

            assertThat(result.status())
                    .as("막지 않으면 공격자 페이지가 사용자의 쿠키로 쓰기를 대신 보낼 수 있다")
                    .isEqualTo(HttpStatus.FORBIDDEN.value());
            assertThat(result.passedThrough())
                    .as("403 을 쓰고도 체인을 계속 태우면 요청이 실행돼 버린다")
                    .isFalse();
        }

        @Test
        @DisplayName("DELETE 도 같은 기준으로 막는다")
        void blocksForeignOriginOnDelete() throws Exception {
            assertThat(run("DELETE", "/api/posts/1", ATTACKER_ORIGIN, null).status())
                    .isEqualTo(HttpStatus.FORBIDDEN.value());
        }

        @Test
        @DisplayName("허용된 출처의 쓰기는 통과한다")
        void allowsKnownOrigin() throws Exception {
            assertThat(run("POST", "/api/posts", ALLOWED_ORIGIN, null).passedThrough())
                    .as("정상 프론트엔드 요청이 막히면 서비스가 죽는다")
                    .isTrue();
        }

        @Test
        @DisplayName("서버 자신과 같은 출처면 목록에 없어도 통과한다")
        void allowsSameOrigin() throws Exception {
            assertThat(run("POST", "/api/posts", "https://api.highteenday.org", null).passedThrough())
                    .as("같은 출처는 CSRF 가 성립하지 않는다. 막으면 Swagger 테스트가 전부 죽는다")
                    .isTrue();
        }

        @Test
        @DisplayName("Origin 도 Referer 도 없으면 통과한다 — 브라우저가 아닌 클라이언트")
        void allowsRequestWithoutOriginOrReferer() throws Exception {
            assertThat(run("POST", "/api/posts", null, null).passedThrough())
                    .as("서버 간 호출·k6 부하 스크립트는 Origin 을 보내지 않는다. 막으면 측정이 죽는다")
                    .isTrue();
        }

        @Test
        @DisplayName("Origin 이 없으면 Referer 의 출처로 판정한다")
        void fallsBackToReferer() throws Exception {
            assertThat(run("POST", "/api/posts", null, ATTACKER_ORIGIN + "/page?q=1").status())
                    .isEqualTo(HttpStatus.FORBIDDEN.value());
        }

        @Test
        @DisplayName("Referer 가 허용 출처면 통과한다")
        void allowsKnownReferer() throws Exception {
            assertThat(run("POST", "/api/posts", null, ALLOWED_ORIGIN + "/write").passedThrough())
                    .isTrue();
        }
    }

    @Nested
    @DisplayName("읽기 요청")
    class ReadRequests {

        @Test
        @DisplayName("GET 은 출처를 따지지 않는다 — CSRF 는 상태를 바꾸는 요청의 문제다")
        void doesNotBlockGet() throws Exception {
            assertThat(run("GET", "/api/boards", ATTACKER_ORIGIN, null).passedThrough()).isTrue();
        }

        @Test
        @DisplayName("OPTIONS 프리플라이트도 막지 않는다 — 막으면 브라우저 요청이 전부 죽는다")
        void doesNotBlockPreflight() throws Exception {
            assertThat(run("OPTIONS", "/api/posts", ATTACKER_ORIGIN, null).passedThrough()).isTrue();
        }
    }

    /**
     * 판정 로직이 맞아도 체인에 안 걸려 있으면 아무것도 막지 못한다.
     * 위 단위 테스트만으로는 그 상태를 못 잡으므로 등록 여부를 따로 확인한다.
     */
    @SpringBootTest
    @ActiveProfiles("test")
    @Import(TestFileStorageConfig.class)
    @DisplayName("필터 등록")
    static class Wiring {

        @Autowired
        FilterChainProxy filterChainProxy;

        @Test
        @DisplayName("보안 필터 체인에 실제로 등록돼 있다")
        void filterIsRegistered() {
            boolean registered = filterChainProxy.getFilterChains().stream()
                    .flatMap(chain -> chain.getFilters().stream())
                    .anyMatch(f -> f instanceof CsrfOriginValidationFilter);

            assertThat(registered)
                    .as("체인에 없으면 판정 로직이 아무리 맞아도 요청을 못 막는다")
                    .isTrue();
        }
    }
}
