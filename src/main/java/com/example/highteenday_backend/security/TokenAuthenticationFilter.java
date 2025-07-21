
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
        System.out.println("================================================ ✅ TokenAuthenticationFilter 진입 ================================================");
        String token = extractToken(request); // 쿠키에서 추출
        String uri = request.getRequestURI();

        System.out.println("token=" + token);
        System.out.println("uri=" + uri);

        if(token == null){
            //로그인 없이 접근가능 url
            if(uri.startsWith("/api/user/login")
                    ||uri.startsWith("/swagger-ui")
                    ||uri.startsWith("/v3/api-docs")
                    ||uri.startsWith("/swagger-ui.html")
                    ||uri.startsWith("/api/posts")
                    ||uri.startsWith("/api/user/register")
                    ||uri.startsWith("/api/boards/")
            ){
                filterChain.doFilter(request, response);
                return;
            } else {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.getWriter().write("Access Token 없음");
            }
            return;
        }

        if (token != null) {
            try {
                Authentication authentication = tokenProvider.getAuthentication(token);

                System.out.println("✅ JWT 인증 성공: " + authentication.getName());

                SecurityContextHolder.getContext().setAuthentication(authentication);

                // 바로 직후 인증 상태 확인
                Authentication contextAuth = SecurityContextHolder.getContext().getAuthentication();
                System.out.println("🧩 최종 인증 상태: " + contextAuth);
                System.out.println("🧩 인증 여부: " + contextAuth.isAuthenticated());
                System.out.println("🧩 권한: " + contextAuth.getAuthorities());

            } catch (RuntimeException e) {
                // 예외 발생 시 여기서 안 막고 다음 필터(TokenExceptionFilter)로 넘겨도 됨
                System.out.println("❌ JWT 인증 실패: " + e.getMessage());
            }
        }

        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        // 쿠키에 먼저 JWT 토큰이 있는지 확인
        System.out.println("request.getCookies() = " + request.getCookies() );
        if(request.getCookies() != null){
            for (Cookie cookie : request.getCookies()) {
                System.out.println("cookie.getName() = " + cookie.getName() );
                System.out.println("cookie.getValue() = " + cookie.getValue() );
                if (cookie.getName().equals("accessToken") && cookie.getValue() != null && !cookie.getValue().isEmpty()) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}
