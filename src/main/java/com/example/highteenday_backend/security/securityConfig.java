package com.example.highteenday_backend.security;

import com.example.highteenday_backend.services.security.CustomOAuth2UserService1;
import com.example.highteenday_backend.domain.users.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.config.Customizer;

@Configuration
public class securityConfig {

    @Autowired
    private CustomOAuth2UserService1 customOAuth2UserService1;
    @Autowired
    private UserRepository userRepository;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {

        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())

                // 권한 부분
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/", "/login").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        )

                // 로그인 부분
                .oauth2Login(oauth -> oauth
                        .successHandler(((request, response, authentication) -> {
                            OAuth2User oaAuth2User = (OAuth2User) authentication.getPrincipal();
                            String email = oaAuth2User.getAttribute("email");

                            boolean exists = userRepository.findByEmail(email).isPresent();

                            // 어디 포트 사용하더라 (일단 개발 시점이니까 리액트 포트로 함)
                            if(exists){
                                response.sendRedirect("http://주소/oauth2-redirect?email=" + email);
                            } else {
                                response.sendRedirect("http://주소/signup/oauth?email=" + email);
                            }
                        }))
                );

        return http.build();
    }
}