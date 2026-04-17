package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.dtos.TokenPair;
import com.example.highteenday_backend.security.TokenProvider;
import com.example.highteenday_backend.services.security.JwtCookieService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/token")
@RequiredArgsConstructor
@Slf4j
public class TokenController {

    private final TokenProvider tokenProvider;
    private final JwtCookieService jwtCookieService;

    @PostMapping("/refresh")
    public ResponseEntity<Void> refresh(HttpServletRequest request, HttpServletResponse response) {
        String refreshToken = extractRefreshToken(request);
        if (refreshToken == null) {
            return ResponseEntity.status(401).build();
        }

        TokenPair tokenPair = tokenProvider.reissueTokens(refreshToken);

        response.addHeader(HttpHeaders.SET_COOKIE, jwtCookieService.buildAccessCookie(tokenPair.accessToken()).toString());
        response.addHeader(HttpHeaders.SET_COOKIE, jwtCookieService.buildRefreshCookie(tokenPair.refreshToken()).toString());

        log.debug("액세스/리프레시 토큰 재발급 완료.");
        return ResponseEntity.ok().build();
    }

    private String extractRefreshToken(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        for (Cookie cookie : request.getCookies()) {
            if ("refreshToken".equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
