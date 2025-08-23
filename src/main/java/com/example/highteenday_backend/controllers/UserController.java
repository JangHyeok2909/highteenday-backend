package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.*;
import com.example.highteenday_backend.dtos.Login.LoginRequestDto;
import com.example.highteenday_backend.dtos.Login.OAuth2UserInfo;
import com.example.highteenday_backend.dtos.Login.RegisterUserDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.security.TokenException;
import com.example.highteenday_backend.security.TokenProvider;
import com.example.highteenday_backend.services.domain.SchoolService;
import com.example.highteenday_backend.services.domain.UserService;
import com.example.highteenday_backend.services.security.JwtCookieService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;


@Tag(name="User Relation API", description = "User 관련 API")
@RequestMapping("/api/user") // 일단 user 로 해놨는데 변경해도 ㄱㅊ
@RestController
@RequiredArgsConstructor
@Slf4j
public class UserController {
    private final UserService userService;
    private final TokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final JwtCookieService jwtCookieService;
    private final SchoolService schoolService;

    // 테스트 코드
    @Operation(summary = "OAuth2 로그인한 사용자 정보 조회 (accessToken 쿠키 기반)")
    @GetMapping("/OAuth2UserInfo")
    public ResponseEntity<?> getOAuth2UserInfo(
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

    // 테스트 코드
    @Operation(summary = "현재 로그인한 사용자 정보 반환")
    @GetMapping("/userInfo")
    public ResponseEntity<UserInfoDto> userInfo(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        User findUser = userService.findByEmail(user.getUser().getEmail());
        UserInfoDto userInfoDto = UserInfoDto.builder()
                .name(findUser.getName())
                .email(findUser.getEmail())
                .nickname(findUser.getNickname())
                .provider(findUser.getProvider().toString())
                .schoolName(findUser.getSchool().getName())
                .phoneNum(findUser.getPhone())
                .userGrade(Optional.ofNullable(findUser.getGrade()).map(Grade::getField).orElse(null))
                .userClass(Optional.ofNullable(findUser.getUserClass()).map(Object::toString).orElse(null))
                .semester(Optional.ofNullable(findUser.getSemester()).map(Semester::getField).orElse(null))
                .build();

        return ResponseEntity.ok().body(userInfoDto);
    }

    // 회원가입
    @Operation(summary = "회원가입")
    @PostMapping("/register")
    public ResponseEntity<?> registerUser(
            @RequestBody RegisterUserDto registerUserDto,
            HttpServletResponse response
            ){
        userService.register(registerUserDto, response);
        return ResponseEntity.ok("회원가입 성공");
    }

    // 회원 탈퇴
    @Operation(summary = "회원 탈퇴")
    @GetMapping("/deleteAccount")
    public ResponseEntity<?> deleteAccount(
            @AuthenticationPrincipal CustomUserPrincipal user
    ){
        User findUser = userService.findByEmail(user.getUser().getEmail());

        userService.deleteAccount(findUser);

        return ResponseEntity.ok("회원 탈퇴 완료");
    }

    // 로그인
    @Operation(summary = "로그인")
    @PostMapping("/login")
    public ResponseEntity<?> loginUser(@RequestBody LoginRequestDto dto, HttpServletResponse response) {

        System.out.println("/api/user/login/ 으로 진입 성공");
        User user = userService.findByEmail(dto.email());

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

    // 로그아웃
    @Operation(summary = "로그아웃 (accessToken 쿠키 제거)")
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

    // 로그인 유저 비밀번호 변경
    @Operation(summary = "비밀번호 변경")
    @PostMapping("/modify/password")
    public ResponseEntity<?> modifyPassword(
        @AuthenticationPrincipal CustomUserPrincipal user,
        @RequestBody ChangePasswordDto passwordDto
    ){
        User findUser = userService.findByEmail(user.getUser().getEmail());

        userService.modifyPassword(findUser, passwordDto);

        return ResponseEntity.ok("비밀번호 변경 완료");
    }

    // 로그인 유저 닉네임 변경
    @Operation(summary = "닉네임 변경")
    @PostMapping("/modify/nickname")
    public ResponseEntity<?> modifyNickname(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestBody ChangeNicknameDto nicknameDto
    ){
        User findUser = userService.findByEmail(user.getUser().getEmail());
        userService.modifyNickname(findUser, nicknameDto);
        return ResponseEntity.ok("닉네임 변경 완료");
    }
    @Operation(summary = "학교 변경")
    @PutMapping("/modify/school")
    public ResponseEntity<?> modifySchool(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                          @RequestBody SchoolIdDto dto){
        User user = userPrincipal.getUser();
        user.setSchool(schoolService.findById(Long.parseLong(dto.schoolId())));
        return ResponseEntity.ok().build();
    }

    // 닉네임 중복 체크
    @Operation(summary = "닉네임 중복 확인")
    @GetMapping("/check/nickname")
    public ResponseEntity<Boolean> checkNickname(
            @RequestParam String nickname
    ) {
        boolean duplCheck = !userService.existsByNickname(nickname);
        return ResponseEntity.ok(duplCheck);
    }
    @Operation(summary = "이메일 중복 확인")
    @GetMapping("/check/email")
    public ResponseEntity<Boolean> checkEmail(
            @RequestParam String email
    ){
        boolean duplCheck = !userService.existsByEmail(email);
        return ResponseEntity.ok(duplCheck);
    }
    @Operation(summary = "전화번호 중복 확인")
    @GetMapping("/check/phone")
    public ResponseEntity<Boolean> checkPhone(
            @RequestParam String phone
    ){
        boolean duplCheck = !userService.existsByPhone(phone);
        return ResponseEntity.ok(duplCheck);
    }

//    @PostMapping("/authentication/phone")
//    public ResponseEntity<?> authenticationPhone(
//            @RequestBody RequestPhoneDto phoneDto
//    ){
//        phoneDto.phoneNum()
//    }
}
