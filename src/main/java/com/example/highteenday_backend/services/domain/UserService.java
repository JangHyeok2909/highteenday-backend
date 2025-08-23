package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.ChangeNicknameDto;
import com.example.highteenday_backend.dtos.ChangePasswordDto;

import com.example.highteenday_backend.dtos.Login.RegisterUserDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.security.JwtCookieService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.jpa.JpaSystemException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

@RequiredArgsConstructor
@Service
@Slf4j
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
    public boolean existsByNickname(String nickname){
        return userRepository.existsByNickname(nickname);
    }
    public boolean existsByEmail(String email){
        return userRepository.existsByEmail(email);
    }
    public boolean existsByPhone(String phone){
        return userRepository.existsByPhone(phone);
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
        log.debug("✅ registerUserDto.nickname = " + registerUserDto.nickname());
        User user = User.builder()
                .nickname(registerUserDto.nickname())
                .name(registerUserDto.name())
                .email(registerUserDto.email())
                .hashedPassword(passwordEncoder.encode(registerUserDto.password()))
                .gender(registerUserDto.gender())
                .provider(Provider.DEFAULT)
                .phone(registerUserDto.phone())
                .build();

        if(registerUserDto.provider()==null) user.setProvider(Provider.DEFAULT);
        else user.setProvider(Provider.valueOf(registerUserDto.provider().toUpperCase()));

        user.setHashedPassword(passwordEncoder.encode(registerUserDto.password()));

        Map<String, Object> attributes = new HashMap<>();

        System.out.println("✅ 현재 제공자 : " + registerUserDto.provider());

        if (user.getProvider()==Provider.DEFAULT) {
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


    // 회원 탈퇴
    @Transactional
    public void deleteAccount(User user){
        // 두번 검사하는거임, 하지말까 유난인가?
        User findUser = userRepository.findByEmail(user.getEmail())
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));

        try{
            userRepository.delete(findUser);
        } catch (DataIntegrityViolationException e) {
            // 외래 키 충돌, 무결성 위반 (예: 참조된 댓글, 게시글이 남아있을 때)
            throw new CustomException(ErrorCode.DATA_INTEGRITY_ERROR);
        } catch (JpaSystemException e) {
            // JPA 내부 오류
            throw new CustomException(ErrorCode.DATABASE_ERROR);
        } catch (Exception e) {
            // 그 외 예외
            throw new CustomException(ErrorCode.INTERNAL_ERROR);
        }
    }

    // 비밀번호 변경 | 정규표현식 적용 가능
    @Transactional
    public void modifyPassword(User user, ChangePasswordDto passwordDto) {
        if (!passwordEncoder.matches(passwordDto.pastPassword(), user.getHashedPassword())) {
            throw new CustomException(ErrorCode.INVALID_PASSWORD);
        } else if (passwordDto.pastPassword().equals(passwordDto.newPassword())) {
            throw new CustomException(ErrorCode.SAME_AS_CURRENT_PASSWORD);
        }

        try {
            String newHashedPassword = passwordEncoder.encode(passwordDto.newPassword());
            user.setHashedPassword(newHashedPassword);
            userRepository.save(user);
        } catch (Exception e) {
            throw new CustomException(ErrorCode.INTERNAL_ERROR);
        }
    }

    // 닉네임 변경
    @Transactional
    public void modifyNickname(User user, ChangeNicknameDto nicknameDto) {
        // 이전과 같은지 검사
        if (nicknameDto.pastNickname().equals(nicknameDto.newNickname())) {
            throw new CustomException(ErrorCode.SAME_AS_NICKNAME);
        } else if(userRepository.existsByNickname(nicknameDto.newNickname())) { // 닉네임이 존재하는지 검사
            throw new CustomException(ErrorCode.DUPLICATE_NICKNAME);
        } else if(nicknameDto.newNickname().length() > 12) { // 닉네임 길이 제한
            throw new CustomException(ErrorCode.INVALID_NICKNAME_FORMAT);
        }

        try {
            String newNickname = nicknameDto.newNickname();
            user.setNickname(newNickname);
            userRepository.save(user);
        } catch (Exception e){
            throw new CustomException(ErrorCode.INTERNAL_ERROR);
        }
    }


}











