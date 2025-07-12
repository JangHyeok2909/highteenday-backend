package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.OAuth2UserInfo;
import com.example.highteenday_backend.dtos.RegisterUserDto;
import com.example.highteenday_backend.dtos.TokenResponse;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.security.TokenProvider;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;


@RequestMapping("/api/user") // 일단 user 로 해놨는데 변경해도 ㄱㅊ
@RestController
@RequiredArgsConstructor
public class UserController {
    private final UserRepository userRepository;
    private final TokenProvider tokenProvider;

    @GetMapping("/loginUser")
    public User getCurrentUser(Authentication authentication) {
        String email = authentication.getName();

        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("로그인 된 사용자 정보 없음"));
    }

    @GetMapping("/OAuth2UserInfo")
    public ResponseEntity<?> getOAuth2UserInfo(
//            @AuthenticationPrincipal OAuth2User oAuth2User
            HttpServletRequest request
    ){
        String accessToken = null;

        // 쿠키에서 accessToken 추출
        if(request.getCookies() != null){
            for (Cookie cookie : request.getCookies()) {
                if ("accessToken".equals((cookie.getName()))) {
                    accessToken = cookie.getValue();
                    break;
                }
            }
        }

        if(accessToken == null){
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "★☆Access Token가 쿠키에 없음★☆"));
        }

        try {
            Authentication authentication = tokenProvider.getAuthentication(accessToken);
            OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();

            Map<String, Object> getOAuthUser = new HashMap<>();

            getOAuthUser.put("Email", oAuth2User.getAttribute("parsed_email"));
            getOAuthUser.put("Name", oAuth2User.getAttribute("name"));
            getOAuthUser.put("Provider", oAuth2User.getAttribute("registrationId"));

            return ResponseEntity.ok(getOAuthUser);
        } catch(Exception e){
            return ResponseEntity.status((HttpStatus.UNAUTHORIZED)).body(Map.of("error", "허용 되지 않은 토큰 "));
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> registerUser(
//            @AuthenticationPrincipal OAuth2User oAuth2User, // RegisterUserDto 에 있지만 변조에 대비해서 원본 데이터를 사용
            @RequestBody  RegisterUserDto registerUserDto
            ){
        String email = registerUserDto.email();
        Optional<User> userOpt = userRepository.findByEmail(email);
        if(!userOpt.isEmpty()){
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("이미 회원가입 한 유저");
        }

        User user = new User();
        user.setName(registerUserDto.name());
        user.setNickname(registerUserDto.nickName());
        user.setProvider(Provider.valueOf(registerUserDto.provider().toUpperCase()));
        user.setEmail(registerUserDto.email());

        userRepository.save(user);

        // 저장 후 토큰 발급하기 위한 처리 코드
        UserDetails userDetails = new org.springframework.security.core.userdetails.User(
                email,
                "",
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );

        Authentication authentication = new UsernamePasswordAuthenticationToken(
                userDetails,
                null,
                userDetails.getAuthorities()
        );

        String accessToken = tokenProvider.generateAccessToken(authentication);
        tokenProvider.generateRefreshToken(authentication, accessToken);

        return ResponseEntity.ok(new TokenResponse(accessToken));
    }

    @GetMapping("/logout")
    public ResponseEntity<?> logout(HttpServletResponse response){
        Cookie accessTokenCookie = new Cookie("accessToken", null);
        accessTokenCookie.setMaxAge(0);
        accessTokenCookie.setPath("/");
        accessTokenCookie.setHttpOnly(true);
        accessTokenCookie.setSecure(true);
        response.addCookie(accessTokenCookie);

        return ResponseEntity.ok("로그아웃");
    }
}
