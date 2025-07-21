package com.example.highteenday_backend.security;

import com.example.highteenday_backend.services.security.CustomOAuth2UserService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.CorsConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.config.Customizer;
import org.springframework.security.web.access.ExceptionTranslationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;

import java.util.List;

// 설정 클래스로 Bean 등록 하라는 어노테이션
@Configuration
public class securityConfig {

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
                                    "https://highteenday.duckdns.org",
                                    "http://localhost:3000"
                            ));
                            config.setAllowCredentials(true);
                            config.setAllowedMethods(List.of("GET","POST"));
                            config.setAllowedHeaders(List.of("*"));
                            return config;
                        }))


                        // 권한 부분(로그인 없이 이용 가능)
                .authorizeHttpRequests(auth -> auth
//                                .requestMatchers("/api/user").authenticated()
                                .requestMatchers(
                                        "/",
                                        "/login/**",
                                        "/oauth2/**",
                                        "/api/user/OAuth2UserInfo",
                                        "/api/user/register",
                                        "/api/user/login",
                                        "/api/posts/**",
                                        "/api/boards/**",
                                        "/v3/api-docs/**",
                                        "/swagger-ui/**",
                                        "/swagger-ui.html",
                                        "/api/comments/**",
                                        "/api/boards/**"
//                                        "/**"
                                ).permitAll()
                                .anyRequest().authenticated()


                )

                // 로그인 부분
                .oauth2Login(oauth -> oauth
                        .userInfoEndpoint(c -> c.userService(customOAuth2UserService))
                        .successHandler(oAuth2SuccessHandler))

                .addFilterBefore(tokenAuthenticationFilter(), ExceptionTranslationFilter.class)
                .addFilterBefore(new TokenExceptionFilter(), TokenAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}