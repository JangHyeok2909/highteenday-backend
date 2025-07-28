package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.RegisterUserDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.security.JwtCookieService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

@RequiredArgsConstructor
@Service
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtCookieService jwtCookieService;

    public User findById(Long userId){
        return userRepository.findById(userId)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
    }
    public User findByEmail(String email){
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND,"존재하지 않는 유저, email="+email));
    }

    @Transactional
    public void register(RegisterUserDto registerUserDto, HttpServletResponse response) {
        String email = registerUserDto.email();

        if (userRepository.findByEmail(email).isPresent()) {
            throw new CustomException(ErrorCode.ALREADY_EXISTS_USER);
        }
//        Optional<User> userOpt = userRepository.findByEmail(email);
//        if(!userOpt.isEmpty()){
//            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("이미 가입된 유저입니다.");
//        }

        System.out.println("✅ registerUserDto.nickname = " + registerUserDto.nickname());

        User user = new User();
        user.setName(registerUserDto.name());
        user.setNickname(registerUserDto.nickname());
        user.setProvider(Provider.valueOf(registerUserDto.provider().toUpperCase()));
        user.setEmail(registerUserDto.email());

        user.setHashedPassword(passwordEncoder.encode(registerUserDto.password()));

        Map<String, Object> attributes = new HashMap<>();

        System.out.println("✅ 현재 제공자 : " + registerUserDto.provider());

        if (registerUserDto.provider().equalsIgnoreCase("DEFAULT")) {
            attributes = Collections.emptyMap();
        } else {
            attributes.put("email", email);
            attributes.put("name", registerUserDto.name());
            attributes.put("provider", registerUserDto.provider());
        }

        // 저장 후 토큰 발급하기 위한 처리 코드
        User savedUser = userRepository.saveAndFlush(user);

        CustomUserPrincipal userDetails = new CustomUserPrincipal(savedUser, attributes, "ROLE_USER");

        Authentication authentication = new UsernamePasswordAuthenticationToken(
                userDetails,
                null,
                userDetails.getAuthorities()
        );

        jwtCookieService.setJwtCookie(authentication,response);
    }

}
