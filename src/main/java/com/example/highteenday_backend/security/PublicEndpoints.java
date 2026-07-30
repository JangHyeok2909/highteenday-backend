package com.example.highteenday_backend.security;

/**
 * 인증 없이 접근할 수 있는 경로 목록.
 *
 * <p>{@link SecurityConfig}는 이 목록에 없는 모든 요청을 인증 필요로 처리한다(deny by default).
 * 따라서 새로 추가되는 엔드포인트는 기본적으로 보호되며, 공개하려면 여기에 명시해야 한다.
 * 목록을 넓힐 때는 해당 경로가 로그인 사용자 개인 데이터를 반환하지 않는지 반드시 확인할 것.
 */
public final class PublicEndpoints {

    private PublicEndpoints() {
    }

    /** 로그인 없이 열람 가능한 커뮤니티 읽기 경로. */
    public static final String[] PUBLIC_GET = {
            "/api/boards",
            "/api/boards/*/posts",
            "/api/posts/search",
            "/api/posts/*",
            "/api/posts/*/comments",
            "/api/posts/*/comments/*",
            "/api/hotposts/**",
            "/api/schools/search",
            // 회원가입 폼의 중복 확인 (로그인 전에 호출된다)
            "/api/user/check/**",
            // 부하 테스트용 정합성 확인. @Profile("!prod")이라 운영에는 빈이 존재하지 않는다.
            "/api/posts/*/consistency"
    };

    /** 로그인/가입/토큰 재발급 등 인증 자체를 수행하는 경로. */
    public static final String[] PUBLIC_POST = {
            "/api/user/register",
            "/api/user/login",
            "/api/token/refresh"
    };

    /** HTTP 메서드와 무관하게 열려 있어야 하는 경로. */
    public static final String[] PUBLIC_ANY = {
            // OAuth2 로그인 시작 및 provider 콜백
            "/oauth2/**",
            // 서블릿 컨테이너의 에러 디스패치
            "/error",
            // SockJS 핸드셰이크. 채팅 구독 권한은 HTTP 계층이 아니라 STOMP 계층에서
            // WebSocketAuthChannelInterceptor가 CONNECT/SUBSCRIBE 시점에 검사한다.
            "/ws/**"
    };
}
