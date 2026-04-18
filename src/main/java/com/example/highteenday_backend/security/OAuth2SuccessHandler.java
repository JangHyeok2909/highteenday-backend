package com.example.highteenday_backend.security;

import com.example.highteenday_backend.services.security.JwtCookieService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final JwtCookieService jwtCookieService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {

        log.info("successhandler 진입");

        OAuth2AuthenticationToken authToken = (OAuth2AuthenticationToken) authentication;
        CustomUserPrincipal customUserPrincipal = (CustomUserPrincipal) authToken.getPrincipal();

        boolean isNew = customUserPrincipal.isNewUser();

        jwtCookieService.setJwtCookie(authentication, response);

        if (isNew) {
            response.sendRedirect(frontendUrl + "/welcome");
        } else {
            response.sendRedirect(frontendUrl);
        }
    }
}
