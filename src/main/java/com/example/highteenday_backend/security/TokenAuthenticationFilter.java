
package com.example.highteenday_backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.TransactionException;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;



/**
 * 요청 쿠키의 accessToken(JWT)을 검증해 SecurityContext에 인증을 싣는 필터.
 *
 * 현재 동작 계약은 다음과 같다.
 * - 토큰이 없거나 검증에 실패해도 여기서 요청을 끊지 않는다. 익명 상태로 다음 필터로
 *   넘어가고, 보호된 엔드포인트라면 뒤의 인가 단계에서 일괄 401이 난다.
 * - 다만 DB나 Redis 때문에 검증을 끝내지 못한 경우는 익명으로 넘기지 않고
 *   {@link com.example.highteenday_backend.enums.ErrorCode#INFRASTRUCTURE_UNAVAILABLE}
 *   로 끊는다. 그래야 클라이언트가 "토큰이 무효하다"와 "지금은 판정할 수 없다"를 구분한다.
 * - 그 결과 앞단의 TokenExceptionFilter(만료/서명오류를 코드별 401로 변환)는 이 필터가
 *   예외를 삼키기 때문에 사실상 도달하지 못한다. 클라이언트는 "만료"와 "무효"를 구분한
 *   에러 코드를 받지 못한다.
 */
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
        log.debug("Auth filter entered. uri={}, tokenPresent={}", uri, token != null);

        if(token == null && isPublicUri(uri)){
            filterChain.doFilter(request, response);
            return;
        }

        if (token != null) {
            try {
                Authentication authentication = tokenProvider.getAuthentication(token);
                SecurityContextHolder.getContext().setAuthentication(authentication);
                log.debug("JWT authentication succeeded. user={}, authorities={}", authentication.getName(), authentication.getAuthorities());

            } catch (TransientDataAccessException | DataAccessResourceFailureException | TransactionException e) {
                // redis 접근 exception을 여기서 잡지 못하면 인프라 문제가 401로 나감.
                log.error("Auth infrastructure failure. uri={}, cause={}", uri, e.getClass().getSimpleName(), e);
                throw new CustomException(ErrorCode.INFRASTRUCTURE_UNAVAILABLE);
            } catch (RuntimeException e) {
                // 검증 실패(만료·서명오류 등)를 여기서 삼키고 익명으로 진행한다.
                log.warn("JWT authentication failed. uri={}, reason={}", uri, e.getMessage());
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
