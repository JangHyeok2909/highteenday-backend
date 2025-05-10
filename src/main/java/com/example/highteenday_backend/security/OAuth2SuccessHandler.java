package com.example.highteenday_backend.security;

import com.example.highteenday_backend.domain.users.UserRepository;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    @Autowired
    private UserRepository userRepository;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {

        OAuth2User oaAuth2User = (OAuth2User) authentication.getPrincipal();
        String email = oaAuth2User.getAttribute("email");

        boolean exists = userRepository.findByEmail(email).isPresent();

        // 이부분 수정 필요
        // 어디 포트 사용`하더라 (일단 개발 시점이니까 리액트 포트로 함)
        if (exists) {
            response.sendRedirect("http://주소/oauth2-redirect?email=" + email);
        } else {
            response.sendRedirect("http://주소/signup/oauth?email=" + email);
        }

    }
}
