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

// 설정 클래스로 Bean 등록 하라는 어노테이션
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
                // 공개 경로만 명시적으로 허용하고 나머지는 전부 인증을 요구한다(deny by default).
                // 공개 목록은 PublicEndpoints에서 관리하며 SecurityPolicyTest가 검증한다.
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PublicEndpoints.PUBLIC_ANY).permitAll()
                        .requestMatchers(HttpMethod.GET, PublicEndpoints.PUBLIC_GET).permitAll()
                        .requestMatchers(HttpMethod.POST, PublicEndpoints.PUBLIC_POST).permitAll()
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