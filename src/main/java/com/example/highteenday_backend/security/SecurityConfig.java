package com.example.highteenday_backend.security;

import com.example.highteenday_backend.services.security.CustomOAuth2UserService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.ExceptionTranslationFilter;
import org.springframework.web.cors.CorsConfiguration;

import java.util.List;

/**
 * Spring Security 설정 — 인가 규칙, CORS, OAuth2 로그인, JWT 필터 배치.
 *
 * 인가 규칙은 **화이트리스트**다: 명시적으로 permitAll 한 경로만 공개이고
 * 나머지는 전부 {@code anyRequest().authenticated()} 로 떨어진다. 새 엔드포인트를
 * 추가하면 메서드와 무관하게 기본값이 "차단"이므로, 공개하려면 아래 목록에
 * 직접 적어야 한다.
 *
 * 예전에는 GET 만 블랙리스트였다 — 마지막에 {@code GET /**} 가 permitAll 이라
 * 새 GET 이 기본 공개가 됐고, 그런 핸들러가 {@code @AuthenticationPrincipal} 을
 * null 체크 없이 쓰면 비인증 요청이 401 이 아니라 NPE 500 으로 터졌다
 * (docs/KNOWN-ISSUES.md KI-04). 인가 매트릭스는 {@code AuthorizationMatrixTest} 가 고정한다.
 */
@Configuration
public class SecurityConfig {

    /**
     * 브라우저에서 이 API 를 부를 수 있는 출처.
     *
     * <p>CORS 허용 목록과 CSRF Origin 검증({@link CsrfOriginValidationFilter})이
     * <b>같은 목록</b>을 본다. 둘이 갈라지면 "CORS 는 통과하는데 쓰기는 403" 같은
     * 설명하기 어려운 상태가 생긴다.
     */
    private static final List<String> ALLOWED_ORIGINS = List.of(
            "https://highteenday.org",
            "https://www.highteenday.org",
            "http://localhost:3000",
            "http://localhost:8080"
    );

    @Autowired
    private CustomOAuth2UserService customOAuth2UserService;
    @Autowired
    private OAuth2SuccessHandler oAuth2SuccessHandler;
    @Autowired
    private TokenProvider tokenProvider;

    @Bean
    public TokenAuthenticationFilter tokenAuthenticationFilter() {
        return new TokenAuthenticationFilter(tokenProvider);
    }
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {

        http
                // 스프링의 CSRF 토큰 방식은 끈 채로 둔다 — 토큰을 켜면 프론트엔드가
                // XSRF 토큰을 되돌려 보내도록 함께 고쳐야 하는데 프론트는 별도 저장소다.
                // 대신 쓰기 요청의 출처를 검사하는 최소 방어를 아래 필터로 넣었다 (KI-06).
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
//                .exceptionHandling(eh -> eh
//                        .authenticationEntryPoint((request, response, authException) -> {
//                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
//                            response.setContentType("application/json");
//                            response.getWriter().write("{\"error\": \"global error.\"}");
//                        })
//                )
                .cors(cors -> cors
                        .configurationSource(request -> {
                            CorsConfiguration config = new CorsConfiguration();
                            config.setAllowedOriginPatterns(ALLOWED_ORIGINS);
                            config.setAllowCredentials(true);
                            config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
                            config.setAllowedHeaders(List.of("*"));
                            config.setExposedHeaders(List.of("Location"));

                            return config;
                        }))
                .exceptionHandling(exceptionHandling ->
                        exceptionHandling.authenticationEntryPoint(((request, response, authException) -> {
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"error\": \"Unauthorize request\"}");
                        }))
                )
                .authorizeHttpRequests(auth -> auth
                        // ── 인프라 경로 ──
                        // WebSocket 엔드포인트 (SockJS 핸드셰이크). 실제 인증은
                        // WebSocketAuthChannelInterceptor 가 STOMP CONNECT 에서 한다.
                        .requestMatchers("/ws/**").permitAll()
                        .requestMatchers("/error").permitAll()
                        // CORS 프리플라이트에는 쿠키가 실리지 않는다. 막으면 브라우저 요청이 전부 죽는다.
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // 관측 지표. prod 는 management.server.port=8081 이라 이 체인에 오지 않지만,
                        // perf 프로파일은 포트를 비워 8080 에서 서빙하므로 이 규칙이 없으면
                        // Prometheus 스크레이프(app:8080/actuator/prometheus)가 401 이 된다.
                        .requestMatchers("/actuator/**").permitAll()
                        // OAuth2 로그인 시작·콜백. 해당 필터가 인가 단계 전에 처리하지만
                        // 규칙을 명시해 의도를 남긴다.
                        .requestMatchers("/oauth2/**").permitAll()

                        // ── 인증 없이 허용하는 쓰기 (로그인·가입·토큰 재발급) ──
                        .requestMatchers(HttpMethod.POST,
                                "/api/user/register",
                                "/api/user/login",
                                "/api/token/refresh"
                        ).permitAll()

                        // ── 인증 없이 허용하는 읽기 ──
                        // 비로그인 열람을 의도한 경로만 여기 적는다. 목록에 없는 GET 은
                        // 아래 anyRequest() 에서 인증 요구로 떨어진다.
                        .requestMatchers(HttpMethod.GET,
                                "/api/boards",                  // 게시판 목록
                                "/api/boards/*/posts",          // 게시판별 글 목록
                                "/api/posts/search",            // 글 검색
                                "/api/posts/*",                 // 글 상세
                                "/api/posts/*/comments",        // 댓글 목록
                                "/api/posts/*/comments/*",      // 댓글 단건
                                "/api/hotposts/**",             // 인기글
                                "/api/schools/search",          // 학교 검색 (가입 절차에서 필요)
                                "/api/user/check/**"            // 닉네임·이메일·전화 중복 확인
                        ).permitAll()

                        // ── 그 외 전부 인증 필요 ──
                        // 화이트리스트다. 새 엔드포인트는 GET 이든 아니든 기본값이 "차단"이므로,
                        // 공개해야 하면 위 목록에 명시적으로 추가해야 한다 (KI-04).
                        .anyRequest().authenticated()
                )


                // 로그인 부분
                .oauth2Login(oauth -> oauth
                        //client->server 로그인 시작 url
                        .authorizationEndpoint(endpoint ->
                                endpoint.baseUri("/oauth2/authorization")
                        )
                        //provider->server 콜백 url
                        .redirectionEndpoint(endpoint ->
                                endpoint.baseUri("/oauth2/login/code/*")
                        )
                        .userInfoEndpoint(c -> c.userService(customOAuth2UserService))
                        .successHandler(oAuth2SuccessHandler))

                .addFilterBefore(tokenAuthenticationFilter(), ExceptionTranslationFilter.class)
                .addFilterBefore(new TokenExceptionFilter(), TokenAuthenticationFilter.class)
                // 인증 작업을 하기 전에 출처부터 끊는다 (KI-06).
                .addFilterBefore(new CsrfOriginValidationFilter(ALLOWED_ORIGINS), TokenExceptionFilter.class);
        return http.build();
    }

    @Bean
    public WebSecurityCustomizer securityCustomizer() {
        return (web) -> web.ignoring().requestMatchers(
                "/swagger-ui/**",
                "/swagger/**",
                "/favicon.ico",
                "/actuator/health"
        );
    }
}