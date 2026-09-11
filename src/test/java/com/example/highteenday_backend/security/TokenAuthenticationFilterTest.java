package com.example.highteenday_backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TokenAuthenticationFilterTest {

    @Mock private TokenProvider tokenProvider;
    @Mock private FilterChain filterChain;

    private TokenAuthenticationFilter filter;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    @BeforeEach
    void setUp() {
        filter = new TokenAuthenticationFilter(tokenProvider);
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        request.setRequestURI("/api/posts");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static Authentication authFor(String name) {
        return new UsernamePasswordAuthenticationToken(
                name, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    @Nested
    @DisplayName("토큰 추출")
    class TokenExtraction {

        @Test
        @DisplayName("accessToken 쿠키가 있으면 인증을 SecurityContext에 담는다")
        void authenticatesFromCookie() throws Exception {
            request.setCookies(new Cookie("accessToken", "valid-token"));
            when(tokenProvider.getAuthentication("valid-token")).thenReturn(authFor("user@test.com"));

            filter.doFilter(request, response, filterChain);

            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
            assertThat(SecurityContextHolder.getContext().getAuthentication().getName())
                    .isEqualTo("user@test.com");
            verify(filterChain).doFilter(request, response);
        }

        @Test
        @DisplayName("여러 쿠키 중 accessToken만 골라 쓴다")
        void picksAccessTokenAmongCookies() throws Exception {
            request.setCookies(
                    new Cookie("sessionId", "abc"),
                    new Cookie("refreshToken", "refresh-token"),
                    new Cookie("accessToken", "valid-token"));
            when(tokenProvider.getAuthentication("valid-token")).thenReturn(authFor("user@test.com"));

            filter.doFilter(request, response, filterChain);

            verify(tokenProvider).getAuthentication("valid-token");
        }

        @Test
        @DisplayName("accessToken 쿠키 값이 비어 있으면 토큰 없음으로 본다")
        void treatsEmptyCookieValueAsAbsent() throws Exception {
            request.setCookies(new Cookie("accessToken", ""));

            filter.doFilter(request, response, filterChain);

            verify(tokenProvider, never()).getAuthentication(any());
            verify(filterChain).doFilter(request, response);
        }

        @Test
        @DisplayName("쿠키가 전혀 없으면 토큰 조회를 하지 않는다")
        void skipsWhenNoCookies() throws Exception {
            filter.doFilter(request, response, filterChain);

            verify(tokenProvider, never()).getAuthentication(any());
            verify(filterChain).doFilter(request, response);
        }

        @Test
        @DisplayName("Authorization 헤더는 읽지 않는다 — 쿠키 전용 인증이다")
        void ignoresAuthorizationHeader() throws Exception {
            request.addHeader("Authorization", "Bearer header-token");

            filter.doFilter(request, response, filterChain);

            verify(tokenProvider, never()).getAuthentication(any());
        }
    }

    @Nested
    @DisplayName("실패 처리")
    class FailureHandling {

        @Test
        @DisplayName("토큰이 유효하지 않아도 체인은 계속 진행된다 — 인증만 비어 있다")
        void continuesChainOnInvalidToken() throws Exception {
            // 필터는 인증 실패를 예외로 올리지 않는다. 접근 제어는 SecurityConfig가 담당한다.
            request.setCookies(new Cookie("accessToken", "bad-token"));
            when(tokenProvider.getAuthentication("bad-token"))
                    .thenThrow(new TokenException(com.example.highteenday_backend.enums.ErrorCode.INVALID_TOKEN));

            filter.doFilter(request, response, filterChain);

            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
            verify(filterChain).doFilter(request, response);
        }

        @Test
        @DisplayName("만료 등 런타임 예외도 삼키고 통과시킨다")
        void swallowsRuntimeException() throws Exception {
            request.setCookies(new Cookie("accessToken", "expired-token"));
            when(tokenProvider.getAuthentication("expired-token"))
                    .thenThrow(new RuntimeException("expired"));

            filter.doFilter(request, response, filterChain);

            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
            verify(filterChain).doFilter(request, response);
        }

        @Test
        @DisplayName("토큰이 없는 보호 URI도 그대로 통과한다 — 차단은 SecurityConfig 책임")
        void passesThroughProtectedUriWithoutToken() throws Exception {
            // 인증 필터는 토큰 부재를 오류로 바꾸지 않는다. 익명 상태로 체인을 통과하고,
            // 최종 차단 여부는 SecurityConfig가 정한다.
            request.setRequestURI("/api/mypage");

            filter.doFilter(request, response, filterChain);

            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
            verify(filterChain).doFilter(request, response);
        }

        @ParameterizedTest
        @ValueSource(strings = {"/api/user/login", "/api/user/register", "/api/user/login/oauth"})
        @DisplayName("공개 URI는 토큰 없이 통과한다")
        void allowsPublicUris(String uri) throws Exception {
            request.setRequestURI(uri);

            filter.doFilter(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            verify(tokenProvider, never()).getAuthentication(any());
        }
    }

    @Nested
    @DisplayName("컨텍스트 오염 방지")
    class ContextIsolation {

        @Test
        @DisplayName("이미 담긴 인증이 있어도 유효한 토큰이면 덮어쓴다")
        void overwritesExistingAuthentication() throws Exception {
            SecurityContextHolder.getContext().setAuthentication(authFor("old@test.com"));
            request.setCookies(new Cookie("accessToken", "valid-token"));
            when(tokenProvider.getAuthentication("valid-token")).thenReturn(authFor("new@test.com"));

            filter.doFilter(request, response, filterChain);

            assertThat(SecurityContextHolder.getContext().getAuthentication().getName())
                    .isEqualTo("new@test.com");
        }

        @Test
        @DisplayName("토큰 검증이 실패하면 기존 인증을 지우지 않는다")
        void keepsExistingAuthenticationOnFailure() throws Exception {
            // 필터가 실패 시 컨텍스트를 건드리지 않는다는 사실을 고정해 둔다.
            SecurityContextHolder.getContext().setAuthentication(authFor("old@test.com"));
            request.setCookies(new Cookie("accessToken", "bad-token"));
            when(tokenProvider.getAuthentication("bad-token"))
                    .thenThrow(new RuntimeException("invalid"));

            filter.doFilter(request, response, filterChain);

            assertThat(SecurityContextHolder.getContext().getAuthentication().getName())
                    .isEqualTo("old@test.com");
        }
    }
}
