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
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private TokenProvider tokenProvider;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {

        OAuth2User oaAuth2User = (OAuth2User) authentication.getPrincipal();
        String email = oaAuth2User.getAttribute("email");

        String accessToken = tokenProvider.generateAccessToken(authentication);
        tokenProvider.generateRefreshToken(authentication, accessToken);

        boolean isGuest = authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_GUEST"));

        String redirectUrl = isGuest ? UriComponentsBuilder.fromUriString("http://주소:포트/signup/oauth")
                .queryParam("email", email)
                .queryParam("accessToken", accessToken)
                .build().toUriString()
                : UriComponentsBuilder.fromUriString("http//주소:포트/oauth2-redirect")
                        .queryParam("email", email)
                        .queryParam("accessToken", accessToken)
                        .build().toUriString();
        response.sendRedirect(redirectUrl);

    }
}
