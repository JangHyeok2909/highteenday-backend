package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.security.TokenProvider;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@RequiredArgsConstructor
@Service
public class JwtCookieService {
    private final TokenProvider tokenProvider;

    @Value("${app.cookie-domain:}")
    private String cookieDomain;

    public void setJwtCookie(Authentication authentication, HttpServletResponse response){
        String accessToken = tokenProvider.generateAccessToken(authentication);
        String refreshToken = tokenProvider.generateRefreshToken(authentication, accessToken);

        String domainAttr = (cookieDomain != null && !cookieDomain.isBlank()) ? "; Domain=" + cookieDomain : "";

        String accessCookie = "accessToken=" + accessToken +
                "; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=None" + domainAttr;
        response.addHeader("Set-Cookie", accessCookie);

        if (refreshToken != null) {
            String refreshCookie = "refreshToken=" + refreshToken +
                    "; Path=/api/token/refresh; Max-Age=604800; HttpOnly; Secure; SameSite=None" + domainAttr;
            response.addHeader("Set-Cookie", refreshCookie);
        }
    }
}
