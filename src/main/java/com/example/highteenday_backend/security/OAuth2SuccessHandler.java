package com.example.highteenday_backend.security;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.services.domain.UserService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Collections;

@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final TokenProvider tokenProvider;
    private final UserService userService;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    @Value("${app.cookie-domain:}")
    private String cookieDomain;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {

        log.info("successhandler 진입");

        OAuth2AuthenticationToken authToken = (OAuth2AuthenticationToken) authentication;
        String registrationId = authToken.getAuthorizedClientRegistrationId();
        CustomUserPrincipal customUserPrincipal = (CustomUserPrincipal) authToken.getPrincipal();

        boolean isGuest = authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_GUEST"));

        if (isGuest) {
            // OAuth 신규 가입: OAuth 정보로 자동 등록
            String email = customUserPrincipal.getUser().getEmail();
            String name = customUserPrincipal.getUser().getName();
            Provider provider = Provider.valueOf(registrationId.toUpperCase());
            String pictureUrl = (String) customUserPrincipal.getAttributes().get("picture");

            log.info("OAuth2 신규 사용자 자동 등록. provider={}, email={}", registrationId, email);

            User savedUser = userService.registerOAuthUser(email, name, provider, pictureUrl);

            // ROLE_USER 인증 객체로 교체
            CustomUserPrincipal registeredPrincipal = new CustomUserPrincipal(savedUser, Collections.emptyMap(), "ROLE_USER");
            authentication = new UsernamePasswordAuthenticationToken(registeredPrincipal, null, registeredPrincipal.getAuthorities());
        } else {
            log.info("OAuth2 로그인 성공. provider={}, email={}", registrationId, customUserPrincipal.getUser().getEmail());
        }

        String accessToken = tokenProvider.generateAccessToken(authentication);
        String refreshToken = tokenProvider.generateRefreshToken(authentication, accessToken);

        String domainAttr = (cookieDomain != null && !cookieDomain.isBlank()) ? "; Domain=" + cookieDomain : "";

        String accessCookie = "accessToken=" + accessToken +
                "; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=None" + domainAttr;
        response.addHeader("Set-Cookie", accessCookie);

        if (refreshToken != null) {
            String refreshCookie = "refreshToken=" + refreshToken +
                    "; Path=/api/token/refresh; Max-Age=604800; HttpOnly; Secure; SameSite=None" + domainAttr;
            response.addHeader("Set-Cookie", refreshCookie);
        }

        if (isGuest) {
            response.sendRedirect(frontendUrl + "/welcome");
        } else {
            response.sendRedirect(frontendUrl);
        }
    }
}
