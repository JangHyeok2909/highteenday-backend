
package com.example.highteenday_backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;



@RequiredArgsConstructor
@Component
@Slf4j
public class TokenAuthenticationFilter extends OncePerRequestFilter {

    private final TokenProvider tokenProvider;
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {
        log.debug("================================================ ✅ TokenAuthenticationFilter 진입 ================================================");
        System.out.println("================================================ ✅ TokenAuthenticationFilter 진입 ================================================");
        String token = extractToken(request); // 쿠키에서 추출

        if (token != null) {
            try {
                Authentication authentication = tokenProvider.getAuthentication(token);

                log.debug("✅ JWT 인증 성공: " + authentication.getName());
                log.debug("✅ 권한: " + authentication.getAuthorities());
                System.out.println("✅ JWT 인증 성공: " + authentication.getName());
                System.out.println("✅ 권한: " + authentication.getAuthorities());



                SecurityContextHolder.getContext().setAuthentication(authentication);

            } catch (RuntimeException e) {
                // 예외 발생 시 여기서 안 막고 다음 필터(TokenExceptionFilter)로 넘겨도 됨
                log.debug("❌ JWT 인증 실패: " + e.getMessage());
                System.out.println("❌ JWT 인증 실패: " + e.getMessage());
            }
        }

        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        // 쿠키에 먼저 JWT 토큰이 있는지 확인
        if(request.getCookies() != null){
            for (Cookie cookie : request.getCookies()) {
                if ("accessToken".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}
