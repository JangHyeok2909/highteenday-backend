package com.example.highteenday_backend.security;

import com.example.highteenday_backend.services.security.CustomOAuth2UserService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
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
                                    "https://highteenday.duckdns.org",
                                    "http://localhost:3000"
                            ));
                            config.setAllowCredentials(true);
                            config.setAllowedMethods(List.of("GET"));
                            config.setAllowedHeaders(List.of("*"));
                            return config;
                        }))
                .exceptionHandling(exceptionHandling ->
                        exceptionHandling.authenticationEntryPoint(((request, response, authException) -> {
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"error\": \"Unauthorized\"}");
                        }))
                )
                .authorizeHttpRequests(auth -> auth
                                //Get 요청 비로그인시 401
                                .requestMatchers(HttpMethod.GET,
                                        "/api/user/OAuth2UserInfo",
                                        "/api/user/loginUser",
                                        "/api/mypage/**"
                                ).authenticated()
                                //Post 요청 비로그인 허용
                                .requestMatchers(HttpMethod.POST,
                                        "/api/user/register",
                                        "/api/user/login"
                                ).permitAll()
                                //Get 요청 비로그인 허용
                                .requestMatchers(HttpMethod.GET,
                                        "/**"
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