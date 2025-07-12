package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.security.TokenProvider;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@RequiredArgsConstructor
@Service
public class JwtCookieService {
    private final TokenProvider tokenProvider;

    public void setJwtCookie(Authentication authentication, HttpServletResponse response){
        String accessToken = tokenProvider.generateAccessToken(authentication);
        tokenProvider.generateRefreshToken(authentication,accessToken);

        Cookie cookie = new Cookie("accessToken", accessToken);
        cookie.setHttpOnly(true);
        cookie.setSecure(false);
        cookie.setPath("/");
        cookie.setAttribute("SameSite", "Strict");
        cookie.setMaxAge(60 * 30);
        response.addCookie(cookie);
    }
}
