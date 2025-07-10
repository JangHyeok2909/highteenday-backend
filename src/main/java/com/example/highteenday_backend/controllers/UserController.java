package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.OAuth2UserInfo;
import com.example.highteenday_backend.dtos.RegisterUserDto;
import com.example.highteenday_backend.enums.Provider;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;


@RequestMapping("/api/user") // 일단 user 로 해놨는데 변경해도 ㄱㅊ
@RestController
@RequiredArgsConstructor
public class UserController {
    private final UserRepository userRepository;

    @GetMapping("/loginUser")
    public User getCurrentUser(Authentication authentication) {
        String email = authentication.getName();

        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("로그인 된 사용자 정보 없음"));
    }

    @GetMapping("/OAuth2UserInfo")
    public Map<String, Object> getOAuth2UserInfo(@AuthenticationPrincipal OAuth2User oAuth2User){

        Map<String, Object> getOAuthUser = new HashMap<>();

        getOAuthUser.put("Email", oAuth2User.getAttribute("parsed_email"));
        getOAuthUser.put("Name", oAuth2User.getAttribute("name"));
        getOAuthUser.put("Provider", oAuth2User.getAttribute("registrationId"));

        return getOAuthUser;
    }

    @PostMapping("/register")
    public ResponseEntity<String> registerUser(
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

        return ResponseEntity.ok("회원가입 완료");
    }
}
