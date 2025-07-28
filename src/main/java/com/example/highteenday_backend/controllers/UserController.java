package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.*;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.security.TokenException;
import com.example.highteenday_backend.security.TokenProvider;
import com.example.highteenday_backend.services.domain.UserService;
import com.example.highteenday_backend.services.security.JwtCookieService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;


@RequestMapping("/api/user") // 일단 user 로 해놨는데 변경해도 ㄱㅊ
@RestController
@RequiredArgsConstructor
@Slf4j
public class UserController {
    private final UserService userService;
    private final TokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final JwtCookieService jwtCookieService;

    @GetMapping("/loginUser")
    public ResponseEntity<UserInfoDto> getCurrentUser(@AuthenticationPrincipal CustomUserPrincipal userDetails) {

        if(userDetails == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        User user = userDetails.getUser();
        UserInfoDto userInfoDto = UserInfoDto.builder()
                .name(user.getName())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .provider(user.getProvider().toString())
                .build();

        return ResponseEntity.ok()
                .body(userInfoDto);
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
            throw new TokenException(ErrorCode.TOKEN_NOT_FOUND);
//            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Access Token이 쿠키에 없음"));
        }

        Authentication authentication = tokenProvider.getAuthentication(accessToken);
        CustomUserPrincipal principal = (CustomUserPrincipal) authentication.getPrincipal();
        OAuth2UserInfo oAuth2UserInfo = principal.getoAuth2UserInfo();

        Map<String, Object> getOAuthUser = new HashMap<>();

        getOAuthUser.put("Email", oAuth2UserInfo.email());
        getOAuthUser.put("Name", oAuth2UserInfo.name());
        getOAuthUser.put("Provider", oAuth2UserInfo.provider());

        return ResponseEntity.ok(getOAuthUser);
    }


    @PostMapping("/register")
    public ResponseEntity<?> registerUser(
//            @AuthenticationPrincipal OAuth2User oAuth2User, // RegisterUserDto 에 있지만 변조에 대비해서 원본 데이터를 사용/ 하려고 했는데 로그인 전에는 이거 사용 불가
            @RequestBody  RegisterUserDto registerUserDto,
            HttpServletResponse response
            ){

        userService.register(registerUserDto, response);

        return ResponseEntity.ok("회원가입 성공");
    }


    @PostMapping("/login")
    public ResponseEntity<?> loginUser(@RequestBody LoginRequestDto dto, HttpServletResponse response) {

        System.out.println("/api/user/login/ 으로 진입 성공");
        User user = userService.findByEmail(dto.email());

//        Optional<User> userOptional = userRepository.findByEmail(dto.email());
//        if(userOptional.isEmpty()){
//            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "존재하지 않는 사용자입니다."));
//        }
//        User user = userOptional.get();

        if (!passwordEncoder.matches(dto.password(), user.getHashedPassword())) {
            throw new CustomException(ErrorCode.INVALID_PASSWORD);
//            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("비밀번호가 올바르지 않습니다.");
        }

        System.out.println("유저 검증, 비밀번호 검증 완료");

        CustomUserPrincipal userDetails = new CustomUserPrincipal(user, Collections.emptyMap(), user.getRole().name());
        Authentication authentication = new UsernamePasswordAuthenticationToken(
                userDetails,
                null,
                userDetails.getAuthorities()
        );

        jwtCookieService.setJwtCookie(authentication, response);
        return ResponseEntity.ok("로그인 성공");
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
