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
 * 인가 규칙을 읽을 때 주의: GET은 "명시된 경로만 인증, 나머지 전부 공개"인
 * 블랙리스트 구조다 (아래 GET /** permitAll). 새 GET 엔드포인트를 추가하면
 * 기본값이 전체 공개가 되므로, 인증이 필요하면 반드시 위의 authenticated()
 * 목록에 경로를 추가해야 한다 (docs/KNOWN-ISSUES.md KI-04).
 * 반대로 GET 이외 메서드는 화이트리스트 구조다 — 명시된 permitAll 외에는 전부 인증.
 */
@Configuration
public class SecurityConfig {

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
                            config.setAllowedOriginPatterns(List.of(
                                    "https://highteenday.org",
                                    "https://www.highteenday.org",
                                    "http://localhost:3000",
                                    "http://localhost:8080"
                            ));
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
                        // WebSocket 엔드포인트 (SockJS 핸드셰이크)
                        .requestMatchers("/ws/**").permitAll()

                        // 중복 체크는 인증 불필요 (GET /api/user/** authenticated 규칙보다 먼저 선언)
                        .requestMatchers(HttpMethod.GET, "/api/user/check/**").permitAll()

                        // GET 요청 중 인증 필요 경로
                        .requestMatchers(HttpMethod.GET,
                                "/api/user/OAuth2UserInfo",
                                "/api/user/loginUser",
                                "/api/user/**",
                                "/api/mypage/**",
                                "/api/timetableTemplates/**",
                                "/api/schools/meals/**",
                                "/api/notifications/**",
                                "/api/chat/**"
                        ).authenticated()

                        // POST/DELETE 요청 중 인증 필요 경로
                        .requestMatchers(HttpMethod.POST, "/api/user/logout").authenticated()
                        .requestMatchers(HttpMethod.DELETE, "/api/user/account").authenticated()

                        // POST 요청 중 인증 없이 허용하는 경로
                        .requestMatchers(HttpMethod.POST,
                                "/api/user/register",
                                "/api/user/login",
                                "/api/token/refresh",
                                "/error"
                        ).permitAll()
                        // 그 외 모든 GET 요청은 허용 — 게시글·댓글 조회를 비로그인에 열기 위한
                        // 선택이지만, 새 GET 엔드포인트가 기본 공개가 되는 부작용이 있다 (KI-04)
                        .requestMatchers(HttpMethod.GET, "/**").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // 그 외 모든 요청은 인증 필요
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
                .addFilterBefore(new TokenExceptionFilter(), TokenAuthenticationFilter.class);
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