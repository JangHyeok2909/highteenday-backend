package com.example.highteenday_backend.security;

import com.example.highteenday_backend.domain.users.UserRepository;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final TokenProvider tokenProvider;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {

        log.info("successhandler 진입");
        OAuth2AuthenticationToken authToken = (OAuth2AuthenticationToken) authentication;
        String registrationId = authToken.getAuthorizedClientRegistrationId();
        System.out.println("registrationId = { " + registrationId + " }");

        CustomUserPrincipal customUserPrincipal = (CustomUserPrincipal) authToken.getPrincipal();

        // user가 null인지 확인 후 출력
        if (customUserPrincipal.getUser() != null) {
            System.out.println("CustomUserPrincipal name = " + customUserPrincipal.getUser().getName());
            System.out.println("CustomUserPrincipal email = " + customUserPrincipal.getUser().getEmail());
        } else if (customUserPrincipal.getAttribute("email") != null) {
            // fallback: OAuth2UserInfo 기반일 경우
            System.out.println("OAuth2 attribute name = " + customUserPrincipal.getAttribute("name"));
            System.out.println("OAuth2 attribute email = " + customUserPrincipal.getAttribute("email"));
        }


        boolean isGuest = authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_GUEST"));

        String accessToken = tokenProvider.generateAccessToken(authentication);
        tokenProvider.generateRefreshToken(authentication, accessToken);

        // smaeSite 설정
        String cookie = "accessToken=" + accessToken +
                "; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=None";
        response.addHeader("Set-Cookie", cookie);


        // "회원가입 페이지" : "로그인 성공 페이지"
        if(isGuest){
            response.sendRedirect("/register");
        } else {
            response.sendRedirect("/post/view");
        }
    }
}
