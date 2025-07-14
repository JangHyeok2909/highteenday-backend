package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.security.TokenProvider;
import jakarta.servlet.http.Cookie; // 더 이상 안 쓰는 방식이라 수정함
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
        tokenProvider.generateRefreshToken(authentication, accessToken);

        String cookie = "accessToken=" + accessToken +
                "; Path=/; Max-Age=1800; HttpOnly";
        response.addHeader("Set-Cookie", cookie);
    }
}
