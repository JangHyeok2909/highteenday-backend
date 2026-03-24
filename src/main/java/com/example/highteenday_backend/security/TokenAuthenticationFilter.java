
package com.example.highteenday_backend.security;

import com.example.highteenday_backend.enums.ErrorCode;
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
        String token = extractToken(request);
        String uri = request.getRequestURI();
        log.debug("인증 필터 진입. uri={}, tokenPresent={}", uri, token != null);

        if(token == null){
            if(isPublicUri(uri)){
                filterChain.doFilter(request, response);
                return;
            } else {
//                throw new TokenException(ErrorCode.TOKEN_NOT_FOUND);
            }
        }

        if (token != null) {
            try {
                Authentication authentication = tokenProvider.getAuthentication(token);
                SecurityContextHolder.getContext().setAuthentication(authentication);
                log.debug("JWT 인증 성공. user={}, authorities={}", authentication.getName(), authentication.getAuthorities());

            } catch (RuntimeException e) {
                log.warn("JWT 인증 실패. uri={}, reason={}", uri, e.getMessage());
            }
        }

        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        // 쿠키에 먼저 JWT 토큰이 있는지 확인
        if(request.getCookies() != null){
            for (Cookie cookie : request.getCookies()) {
                if (cookie.getName().equals("accessToken") && cookie.getValue() != null && !cookie.getValue().isEmpty()) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }

    private boolean isPublicUri(String uri){
        return uri.startsWith("/api/user/login") || uri.startsWith("/api/user/register");
    }
}
