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
        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
        log.info("네이버 OAuth 전체 attributes: {}", oAuth2User.getAttributes());
        System.out.println("네이버 OAuth 전체 attributes: {}" + oAuth2User.getAttributes());

        String email = oAuth2User.getAttribute("parsed_email");

        boolean isGuest = authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_GUEST"));

        // "회원가입 페이지" : "로그인 성공 페이지"
        if(isGuest){
            response.sendRedirect("https://highteenday.duckdns.org/register");
            return;
        }

        String accessToken = tokenProvider.generateAccessToken(authentication);
        tokenProvider.generateRefreshToken(authentication, accessToken);

        Cookie accessTokenCookie = new Cookie("accessToken", accessToken);
        accessTokenCookie.setHttpOnly(true);
        accessTokenCookie.setSecure(true);
        accessTokenCookie.setPath("/");
        accessTokenCookie.setMaxAge(60*60);

        response.addCookie(accessTokenCookie);

        response.sendRedirect("https://highteenday.duckdns.org/post/view");
    }
}
