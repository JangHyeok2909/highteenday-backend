package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.*;
import com.example.highteenday_backend.dtos.Login.LoginRequestDto;
import com.example.highteenday_backend.dtos.Login.OAuth2UserInfo;
import com.example.highteenday_backend.dtos.Login.RegisterUserDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.security.TokenException;
import com.example.highteenday_backend.security.TokenProvider;
import com.example.highteenday_backend.services.domain.TokenService;
import com.example.highteenday_backend.services.domain.UserService;
import com.example.highteenday_backend.services.security.JwtCookieService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import jakarta.validation.Valid;
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


@Tag(name="User Relation API", description = "User 관련 API")
@RequestMapping("/api/user")
@RestController
@RequiredArgsConstructor
@Slf4j
public class UserController {
    private final UserService userService;
    private final TokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final JwtCookieService jwtCookieService;
    private final TokenService tokenService;

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

    @Operation(summary = "현재 로그인한 사용자 정보 반환")
    @GetMapping("/userInfo")
    public ResponseEntity<UserInfoDto> userInfo(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        UserInfoDto userInfoDto = userService.getUserInfoDto(user.getUser().getEmail());
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
    @DeleteMapping("/account")
    public ResponseEntity<?> deleteAccount(
            @AuthenticationPrincipal CustomUserPrincipal user,
            HttpServletResponse response
    ){
        User findUser = userService.findByEmail(user.getUser().getEmail());

        tokenService.deleteByUserEmail(findUser.getEmail());
        userService.deleteAccount(findUser);

        response.addHeader(HttpHeaders.SET_COOKIE, jwtCookieService.expireAccessCookie().toString());
        response.addHeader(HttpHeaders.SET_COOKIE, jwtCookieService.expireRefreshCookie().toString());

        return ResponseEntity.ok("회원 탈퇴 완료");
    }

    // 로그인
    @Operation(summary = "로그인")
    @PostMapping("/login")
    public ResponseEntity<?> loginUser(@Valid @RequestBody LoginRequestDto dto, HttpServletResponse response) {

        log.info("로그인 요청. email={}", dto.email());
        User user = userService.findByEmail(dto.email());

        if (!passwordEncoder.matches(dto.password(), user.getHashedPassword())) {
            throw new CustomException(ErrorCode.INVALID_PASSWORD);
        }

        log.debug("로그인 인증 완료. userId={}", user.getId());

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
    @Operation(summary = "로그아웃 (서버 refreshToken 삭제 + accessToken/refreshToken 쿠키 만료)")
    @PostMapping("/logout")
    public ResponseEntity<?> logout(
            @AuthenticationPrincipal CustomUserPrincipal user,
            HttpServletResponse response
    ){
        tokenService.deleteByUserEmail(user.getUser().getEmail());

        response.addHeader(HttpHeaders.SET_COOKIE, jwtCookieService.expireAccessCookie().toString());
        response.addHeader(HttpHeaders.SET_COOKIE, jwtCookieService.expireRefreshCookie().toString());

        return ResponseEntity.ok("로그아웃");
    }

    // 로그인 유저 비밀번호 변경
    @Operation(summary = "비밀번호 변경")
    @PatchMapping("/password")
    public ResponseEntity<?> modifyPassword(
        @AuthenticationPrincipal CustomUserPrincipal user,
        @RequestBody ChangePasswordDto passwordDto
    ){
        User findUser = userService.findByEmail(user.getUser().getEmail());
        userService.updatePassword(findUser, passwordDto);
        return ResponseEntity.ok("비밀번호 변경 완료");
    }

    // 로그인 유저 닉네임 변경
    @Operation(summary = "닉네임 변경")
    @PatchMapping("/nickname")
    public ResponseEntity<?> modifyNickname(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestBody ChangeNicknameDto nicknameDto
    ){
        User findUser = userService.findByEmail(user.getUser().getEmail());
        userService.updateNickname(findUser, nicknameDto);
        return ResponseEntity.ok("닉네임 변경 완료");
    }

    @Operation(summary = "학교/학년/반 변경")
    @PatchMapping("/school")
    public ResponseEntity<?> modifySchool(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                          @RequestBody SchoolIdDto dto){
        User user = userService.findById(userPrincipal.getUser().getId());
        userService.updateSchool(user, dto);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "전화번호 변경")
    @PatchMapping("/phone")
    public ResponseEntity<?> modifyPhone(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                         @RequestBody ChangePhoneDto dto){
        User user = userService.findById(userPrincipal.getUser().getId());
        userService.updatePhone(user, dto);
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
