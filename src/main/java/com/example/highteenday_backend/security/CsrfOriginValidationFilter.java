package com.example.highteenday_backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Set;

/**
 * 상태를 바꾸는 요청의 출처(Origin)를 검사하는 CSRF 최소 방어 (docs/KNOWN-ISSUES.md KI-06).
 *
 * <h2>왜 필요한가</h2>
 * 이 서비스는 HttpOnly 쿠키로 인증하고 쿠키가 {@code SameSite=None} 이다. 즉 브라우저가
 * <b>다른 사이트에서 보낸 요청에도 인증 쿠키를 실어 준다.</b> CSRF 토큰이 없으므로,
 * 공격자 페이지가 사용자의 브라우저로 글 삭제 같은 쓰기 요청을 대신 보낼 수 있다.
 *
 * <h2>어떻게 막는가</h2>
 * 브라우저는 교차 출처 쓰기 요청에 {@code Origin} 헤더를 <b>반드시</b> 붙이고,
 * 그 값은 스크립트가 위조할 수 없다. 그래서 쓰기 메서드에 한해 Origin 이 허용 목록에
 * 있는지 확인하고, 아니면 403 으로 끊는다. {@code Origin} 이 없으면 {@code Referer} 로
 * 한 번 더 본다.
 *
 * <h2>한계 — 이걸 알고 써야 한다</h2>
 * <b>두 헤더가 모두 없으면 통과시킨다.</b> 서버 간 호출·curl·k6 부하 스크립트처럼
 * 브라우저가 아닌 클라이언트는 Origin 을 보내지 않는데, 그것까지 막으면 정상 이용과
 * 성능 측정이 죽는다. CSRF 는 <b>브라우저를 통해서만</b> 성립하는 공격이고 브라우저는
 * 교차 출처 쓰기에 Origin 을 생략하지 않으므로, 이 예외가 방어에 구멍을 내지는 않는다.
 * 다만 이건 토큰 방식(double-submit)보다 약한 방어다 — 토큰 방식은 프론트엔드가
 * 토큰을 되돌려 보내도록 함께 고쳐야 해서 이번 범위 밖이다.
 *
 * <h2>같은 출처는 허용한다</h2>
 * 요청이 자기 자신에게 온 경우(예: 로컬에서 Swagger UI 로 API 호출)를 허용 목록에
 * 넣지 않아도 통과시킨다. 같은 출처 요청은 CSRF 가 성립하지 않고, 넣지 않으면
 * 개발 환경의 Swagger 테스트가 전부 403 이 된다.
 */
@Slf4j
public class CsrfOriginValidationFilter extends OncePerRequestFilter {

    /** 서버 상태를 바꾸지 않는 메서드는 검사하지 않는다. */
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    private final List<String> allowedOrigins;

    public CsrfOriginValidationFilter(List<String> allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        if (SAFE_METHODS.contains(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        String origin = request.getHeader("Origin");
        if (origin == null) {
            // Origin 이 없으면 Referer 에서 출처만 잘라 본다. 둘 다 없으면 브라우저가 아니다.
            origin = originOf(request.getHeader("Referer"));
        }
        if (origin == null) {
            filterChain.doFilter(request, response);
            return;
        }

        if (isAllowed(origin, request)) {
            filterChain.doFilter(request, response);
            return;
        }

        log.warn("Blocked cross-site write. method={}, uri={}, origin={}",
                request.getMethod(), request.getRequestURI(), origin);
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":\"FORBIDDEN\",\"message\":\"허용되지 않은 출처의 요청입니다.\"}");
    }

    private boolean isAllowed(String origin, HttpServletRequest request) {
        return allowedOrigins.contains(origin) || origin.equals(selfOrigin(request));
    }

    /** 요청이 도달한 서버 자신의 출처. 같은 출처 요청을 허용하기 위한 것이다. */
    private static String selfOrigin(HttpServletRequest request) {
        String scheme = request.getScheme();
        int port = request.getServerPort();
        boolean defaultPort = ("http".equals(scheme) && port == 80) || ("https".equals(scheme) && port == 443);
        return defaultPort
                ? scheme + "://" + request.getServerName()
                : scheme + "://" + request.getServerName() + ":" + port;
    }

    /** Referer 전체 URL 에서 {@code scheme://host[:port]} 만 잘라낸다. */
    private static String originOf(String url) {
        if (url == null || url.isBlank()) return null;
        try {
            URI uri = new URI(url);
            if (uri.getScheme() == null || uri.getHost() == null) return null;
            return uri.getPort() == -1
                    ? uri.getScheme() + "://" + uri.getHost()
                    : uri.getScheme() + "://" + uri.getHost() + ":" + uri.getPort();
        } catch (URISyntaxException e) {
            return null;
        }
    }
}
