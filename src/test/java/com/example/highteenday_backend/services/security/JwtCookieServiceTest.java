package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.security.TokenProvider;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class JwtCookieServiceTest {

    @Mock private TokenProvider tokenProvider;
    @Mock private HttpServletResponse response;
    @Mock private Authentication authentication;

    private JwtCookieService service;

    @BeforeEach
    void setUp() {
        service = new JwtCookieService(tokenProvider);
        // @Value 필드는 스프링 없이는 주입되지 않으므로 운영 기본값을 직접 넣는다.
        setProperties(".highteenday.org", true, "None");
    }

    private void setProperties(String domain, boolean secure, String sameSite) {
        ReflectionTestUtils.setField(service, "cookieDomain", domain);
        ReflectionTestUtils.setField(service, "cookieSecure", secure);
        ReflectionTestUtils.setField(service, "cookieSameSite", sameSite);
    }

    @Nested
    @DisplayName("쿠키 속성")
    class CookieAttributes {

        @Test
        @DisplayName("accessToken은 30분, 루트 경로에 심긴다")
        void buildsAccessCookie() {
            ResponseCookie cookie = service.buildAccessCookie("access-value");

            assertThat(cookie.getName()).isEqualTo("accessToken");
            assertThat(cookie.getValue()).isEqualTo("access-value");
            assertThat(cookie.getPath()).isEqualTo("/");
            assertThat(cookie.getMaxAge().getSeconds()).isEqualTo(1800);
            assertThat(cookie.isHttpOnly()).isTrue();
            assertThat(cookie.isSecure()).isTrue();
            assertThat(cookie.getSameSite()).isEqualTo("None");
            assertThat(cookie.getDomain()).isEqualTo(".highteenday.org");
        }

        @Test
        @DisplayName("refreshToken은 7일이고 재발급 경로로 스코프가 좁혀진다")
        void buildsRefreshCookieScopedToRefreshEndpoint() {
            // 경로를 좁혀 두면 일반 API 요청에 refreshToken이 실려 나가지 않는다.
            ResponseCookie cookie = service.buildRefreshCookie("refresh-value");

            assertThat(cookie.getName()).isEqualTo("refreshToken");
            assertThat(cookie.getPath()).isEqualTo("/api/token/refresh");
            assertThat(cookie.getMaxAge().getSeconds()).isEqualTo(604800);
            assertThat(cookie.isHttpOnly()).isTrue();
        }

        @Test
        @DisplayName("모든 쿠키는 HttpOnly다 — 스크립트에서 토큰을 읽을 수 없어야 한다")
        void allCookiesAreHttpOnly() {
            assertThat(List.of(
                    service.buildAccessCookie("a"),
                    service.buildRefreshCookie("r"),
                    service.expireAccessCookie(),
                    service.expireRefreshCookie()))
                    .allSatisfy(cookie -> assertThat(cookie.isHttpOnly()).isTrue());
        }

        @Test
        @DisplayName("만료 쿠키는 빈 값 + maxAge=0이고 경로는 발급 때와 같다")
        void buildsExpiringCookies() {
            ResponseCookie access = service.expireAccessCookie();
            ResponseCookie refresh = service.expireRefreshCookie();

            assertThat(access.getValue()).isEmpty();
            assertThat(access.getMaxAge().getSeconds()).isZero();
            assertThat(access.getPath()).isEqualTo("/");

            assertThat(refresh.getValue()).isEmpty();
            assertThat(refresh.getMaxAge().getSeconds()).isZero();
            // 경로가 발급 때와 다르면 브라우저가 쿠키를 지우지 못한다
            assertThat(refresh.getPath()).isEqualTo("/api/token/refresh");
        }

        @Test
        @DisplayName("cookieDomain이 빈 문자열이면 Domain 속성을 넣지 않는다 — 로컬 개발용")
        void omitsDomainWhenBlank() {
            setProperties("", false, "Lax");

            ResponseCookie cookie = service.buildAccessCookie("a");

            assertThat(cookie.getDomain()).isNull();
            assertThat(cookie.isSecure()).isFalse();
            assertThat(cookie.getSameSite()).isEqualTo("Lax");
        }

        @Test
        @DisplayName("SameSite=None이면 Secure도 켜져 있어야 한다 — 운영 설정 조합 확인")
        void sameSiteNoneRequiresSecure() {
            // 브라우저는 SameSite=None 쿠키를 Secure 없이 거부한다.
            ResponseCookie cookie = service.buildAccessCookie("a");

            assertThat(cookie.getSameSite()).isEqualTo("None");
            assertThat(cookie.isSecure()).isTrue();
        }
    }

    @Nested
    @DisplayName("setJwtCookie")
    class SetJwtCookie {

        @Test
        @DisplayName("access/refresh 두 쿠키를 Set-Cookie 헤더로 붙인다")
        void addsBothCookies() {
            when(tokenProvider.generateAccessToken(authentication)).thenReturn("access-value");
            when(tokenProvider.generateRefreshToken(eq(authentication), anyString()))
                    .thenReturn("refresh-value");

            service.setJwtCookie(authentication, response);

            ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
            verify(response, org.mockito.Mockito.times(2))
                    .addHeader(eq(HttpHeaders.SET_COOKIE), captor.capture());

            assertThat(captor.getAllValues()).hasSize(2);
            assertThat(captor.getAllValues().get(0)).contains("accessToken=access-value");
            assertThat(captor.getAllValues().get(1)).contains("refreshToken=refresh-value");
        }

        @Test
        @DisplayName("refresh 토큰 발급은 access 토큰을 인자로 받는다")
        void passesAccessTokenIntoRefreshGeneration() {
            when(tokenProvider.generateAccessToken(authentication)).thenReturn("access-value");
            when(tokenProvider.generateRefreshToken(any(), anyString())).thenReturn("refresh-value");

            service.setJwtCookie(authentication, response);

            verify(tokenProvider).generateRefreshToken(authentication, "access-value");
        }

        @Test
        @DisplayName("refresh 토큰이 null이면 access 쿠키만 심는다")
        void skipsRefreshCookieWhenTokenNull() {
            when(tokenProvider.generateAccessToken(authentication)).thenReturn("access-value");
            when(tokenProvider.generateRefreshToken(any(), anyString())).thenReturn(null);

            service.setJwtCookie(authentication, response);

            ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
            verify(response).addHeader(eq(HttpHeaders.SET_COOKIE), captor.capture());
            assertThat(captor.getValue()).contains("accessToken=access-value");
        }

        @Test
        @DisplayName("심어진 헤더에 HttpOnly와 SameSite가 실제로 포함된다")
        void headerCarriesSecurityAttributes() {
            when(tokenProvider.generateAccessToken(authentication)).thenReturn("access-value");
            when(tokenProvider.generateRefreshToken(any(), anyString())).thenReturn(null);

            service.setJwtCookie(authentication, response);

            ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
            verify(response).addHeader(eq(HttpHeaders.SET_COOKIE), captor.capture());
            assertThat(captor.getValue())
                    .contains("HttpOnly")
                    .contains("Secure")
                    .contains("SameSite=None")
                    .contains("Domain=.highteenday.org")
                    .contains("Path=/");
        }

        @Test
        @DisplayName("토큰 생성이 실패하면 쿠키를 심지 않는다")
        void doesNotSetCookieWhenGenerationFails() {
            when(tokenProvider.generateAccessToken(authentication))
                    .thenThrow(new IllegalStateException("key missing"));

            org.assertj.core.api.Assertions
                    .assertThatThrownBy(() -> service.setJwtCookie(authentication, response))
                    .isInstanceOf(IllegalStateException.class);

            verify(response, never()).addHeader(anyString(), anyString());
        }
    }
}
