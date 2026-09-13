package com.example.highteenday_backend.security;

import com.example.highteenday_backend.exceptions.CustomException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 필터 단계에서 던진 {@link CustomException}을 HTTP 응답으로 바꾼다.
 *
 * <p>필터에서 던진 예외는 DispatcherServlet에 닿지 않으므로 {@code @RestControllerAdvice}가
 * 받지 못한다. 그래서 이 필터가 같은 일을 직접 한다. 잡는 대상이 {@link TokenException}이
 * 아니라 상위 타입인 {@link CustomException}인 이유는 TokenAuthenticationFilter가 인프라
 * 실패를 INFRASTRUCTURE_UNAVAILABLE로 던지기 때문이다. 잡지 못하면 서블릿 컨테이너까지
 * 올라가 500이 되고, 그러면 "의존성이 죽었다"와 "서버 코드가 틀렸다"가 다시 같은 상태
 * 코드로 합쳐진다.</p>
 */
public class TokenExceptionFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        try{
            filterChain.doFilter(request, response);
        } catch (CustomException e){
            response.setStatus(e.getErrorCode().getHttpStatus().value());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\": \"" + e.getMessage() + "\"}");
        }

    }
}
