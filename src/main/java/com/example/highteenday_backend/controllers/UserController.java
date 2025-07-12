package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.LoginRequestDto;
import com.example.highteenday_backend.dtos.RegisterUserDto;
import com.example.highteenday_backend.dtos.TokenResponse;
import com.example.highteenday_backend.dtos.UserInfoDto;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.security.CustomUserDetails;
import com.example.highteenday_backend.security.TokenProvider;
import com.example.highteenday_backend.services.security.JwtCookieService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;


@RequestMapping("/api/user") // 일단 user 로 해놨는데 변경해도 ㄱㅊ
@RestController
@RequiredArgsConstructor
@Slf4j
public class UserController {
    private final UserRepository userRepository;
    private final TokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final JwtCookieService jwtCookieService;

    @GetMapping("/loginUser")
    public ResponseEntity<UserInfoDto> getCurrentUser(@AuthenticationPrincipal CustomUserDetails userDetails) {

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
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.PRAGMA, "no-cache")
                .header(HttpHeaders.EXPIRES, "0")
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
            @RequestBody  RegisterUserDto registerUserDto,
            HttpServletResponse response
            ){
        String email = registerUserDto.email();
        Optional<User> userOpt = userRepository.findByEmail(email);
        if(!userOpt.isEmpty()){
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("이미 회원가입 한 유저");
        }

        User user = new User();
        user.setName(registerUserDto.name());
        user.setNickname(registerUserDto.nickname());
        user.setProvider(Provider.valueOf(registerUserDto.provider().toUpperCase()));
        user.setEmail(registerUserDto.email());
        //비밀번호 해시하여 저장
        String hashedPassword = passwordEncoder.encode(registerUserDto.password());
        user.setHashedPassword(hashedPassword);


        // 저장 후 토큰 발급하기 위한 처리 코드
        User savedUser = userRepository.save(user);
        CustomUserDetails userDetails = new CustomUserDetails(savedUser);

        Authentication authentication = new UsernamePasswordAuthenticationToken(
                userDetails,
                null,
                userDetails.getAuthorities()
        );

        jwtCookieService.setJwtCookie(authentication,response);

        return ResponseEntity.ok("회원가입 성공");
    }
    @PostMapping("/login")
    public ResponseEntity<?> loginUser(@RequestBody LoginRequestDto dto,HttpServletResponse response){
        User user = userRepository.findByEmail(dto.email())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "존재하지 않는 사용자 입니다."));
        if(!passwordEncoder.matches(dto.password(), user.getHashedPassword())){
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("비밀번호가 올바르지 않습니다.");
        }
        CustomUserDetails userDetails = new CustomUserDetails(user);
        Authentication authentication=new UsernamePasswordAuthenticationToken(
                userDetails,
                null,
                userDetails.getAuthorities()
        );

        jwtCookieService.setJwtCookie(authentication,response);
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
