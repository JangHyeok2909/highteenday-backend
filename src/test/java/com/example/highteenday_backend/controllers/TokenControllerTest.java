package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.dtos.TokenPair;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.security.TokenException;
import com.example.highteenday_backend.security.TokenProvider;
import com.example.highteenday_backend.services.security.JwtCookieService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("TokenController")
class TokenControllerTest {

    @Mock private TokenProvider tokenProvider;
    @Mock private JwtCookieService jwtCookieService;

    @InjectMocks
    private TokenController tokenController;

    // ──────────────────────────────────────────────
    // POST /api/token/refresh
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("POST /api/token/refresh")
    class Refresh {

        @Test
        @DisplayName("refreshToken 쿠키가 있으면 200 + Set-Cookie 헤더 2개를 반환한다")
        void reissuesTokensAndSetsCookies() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setCookies(new Cookie("refreshToken", "valid-rt"));
            MockHttpServletResponse response = new MockHttpServletResponse();

            when(tokenProvider.reissueTokens("valid-rt"))
                    .thenReturn(new TokenPair("new-at", "new-rt"));
            when(jwtCookieService.buildAccessCookie("new-at"))
                    .thenReturn(ResponseCookie.from("accessToken", "new-at").path("/").build());
            when(jwtCookieService.buildRefreshCookie("new-rt"))
                    .thenReturn(ResponseCookie.from("refreshToken", "new-rt").path("/api/token/refresh").build());

            ResponseEntity<Void> result = tokenController.refresh(request, response);

            assertThat(result.getStatusCode().value()).isEqualTo(200);

            List<String> setCookies = response.getHeaders("Set-Cookie");
            assertThat(setCookies).hasSize(2);
            assertThat(setCookies.get(0)).contains("accessToken=new-at");
            assertThat(setCookies.get(1)).contains("refreshToken=new-rt");
        }

        @Test
        @DisplayName("refreshToken 쿠키가 없으면 401을 반환하고 토큰 재발급을 시도하지 않는다")
        void returns401WhenNoCookie() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();

            ResponseEntity<Void> result = tokenController.refresh(request, response);

            assertThat(result.getStatusCode().value()).isEqualTo(401);
            verify(tokenProvider, never()).reissueTokens(org.mockito.ArgumentMatchers.any());
        }

        @Test
        @DisplayName("쿠키가 여러 개여도 refreshToken 쿠키만 추출해 사용한다")
        void extractsRefreshTokenFromMultipleCookies() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setCookies(
                    new Cookie("accessToken", "old-at"),
                    new Cookie("refreshToken", "valid-rt"),
                    new Cookie("other", "value")
            );
            MockHttpServletResponse response = new MockHttpServletResponse();

            when(tokenProvider.reissueTokens("valid-rt"))
                    .thenReturn(new TokenPair("new-at", "new-rt"));
            when(jwtCookieService.buildAccessCookie("new-at"))
                    .thenReturn(ResponseCookie.from("accessToken", "new-at").build());
            when(jwtCookieService.buildRefreshCookie("new-rt"))
                    .thenReturn(ResponseCookie.from("refreshToken", "new-rt").build());

            ResponseEntity<Void> result = tokenController.refresh(request, response);

            assertThat(result.getStatusCode().value()).isEqualTo(200);
            verify(tokenProvider).reissueTokens("valid-rt");
        }

        @Test
        @DisplayName("만료된 refresh token → TokenException 이 컨트롤러 밖으로 전파된다")
        void propagatesTokenExpiredException() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setCookies(new Cookie("refreshToken", "expired-rt"));
            MockHttpServletResponse response = new MockHttpServletResponse();

            when(tokenProvider.reissueTokens("expired-rt"))
                    .thenThrow(new TokenException(ErrorCode.TOKEN_EXPIRED));

            assertThatThrownBy(() -> tokenController.refresh(request, response))
                    .isInstanceOf(TokenException.class)
                    .satisfies(ex -> assertThat(((TokenException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.TOKEN_EXPIRED));
        }

        @Test
        @DisplayName("위변조된 refresh token → TokenException 이 컨트롤러 밖으로 전파된다")
        void propagatesInvalidSignatureException() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setCookies(new Cookie("refreshToken", "forged-rt"));
            MockHttpServletResponse response = new MockHttpServletResponse();

            when(tokenProvider.reissueTokens("forged-rt"))
                    .thenThrow(new TokenException(ErrorCode.INVALID_JWT_SIGNATURE));

            assertThatThrownBy(() -> tokenController.refresh(request, response))
                    .isInstanceOf(TokenException.class)
                    .satisfies(ex -> assertThat(((TokenException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_JWT_SIGNATURE));
        }
    }
}
