package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.security.TokenProvider;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@RequiredArgsConstructor
@Service
public class JwtCookieService {
    private final TokenProvider tokenProvider;

    @Value("${app.cookie-domain:}")
    private String cookieDomain;

    @Value("${app.cookie-secure:true}")
    private boolean cookieSecure;

    @Value("${app.cookie-same-site:None}")
    private String cookieSameSite;

    public void setJwtCookie(Authentication authentication, HttpServletResponse response) {
        String accessToken = tokenProvider.generateAccessToken(authentication);
        String refreshToken = tokenProvider.generateRefreshToken(authentication, accessToken);

        response.addHeader(HttpHeaders.SET_COOKIE, buildAccessCookie(accessToken).toString());
        if (refreshToken != null) {
            response.addHeader(HttpHeaders.SET_COOKIE, buildRefreshCookie(refreshToken).toString());
        }
    }

    public ResponseCookie buildAccessCookie(String value) {
        return build("accessToken", value, "/", 1800);
    }

    public ResponseCookie buildRefreshCookie(String value) {
        return build("refreshToken", value, "/api/token/refresh", 604800);
    }

    public ResponseCookie expireAccessCookie() {
        return build("accessToken", "", "/", 0);
    }

    public ResponseCookie expireRefreshCookie() {
        return build("refreshToken", "", "/api/token/refresh", 0);
    }

    private ResponseCookie build(String name, String value, String path, long maxAge) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(cookieSecure)
                .path(path)
                .maxAge(maxAge)
                .sameSite(cookieSameSite);
        if (!cookieDomain.isBlank()) {
            builder.domain(cookieDomain);
        }
        return builder.build();
    }
}
