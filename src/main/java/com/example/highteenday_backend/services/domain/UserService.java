package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.ChangeNicknameDto;
import com.example.highteenday_backend.dtos.ChangePasswordDto;
import com.example.highteenday_backend.dtos.UserInfoDto;
import com.example.highteenday_backend.dtos.Login.RegisterUserDto;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.security.JwtCookieService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.jpa.JpaSystemException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.Optional;
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

    @Transactional(readOnly = true)
    public UserInfoDto getUserInfoDto(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND, "존재하지 않는 유저, email=" + email));
        String schoolName = user.getSchool() != null ? user.getSchool().getName() : null;
        return UserInfoDto.builder()
                .name(user.getName())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .profileUrl(user.getProfileUrl())
                .provider(user.getProvider().toString())
                .schoolName(schoolName)
                .phoneNum(user.getPhone())
                .userGrade(Optional.ofNullable(user.getGrade()).map(Grade::getField).orElse(null))
                .userClass(Optional.ofNullable(user.getUserClass()).map(Object::toString).orElse(null))
                .semester(Optional.ofNullable(user.getSemester()).map(Semester::getField).orElse(null))
                .build();
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

        log.info("회원가입 진행. nickname={}, email={}", registerUserDto.nickname(), registerUserDto.email());
        User user = User.builder()
                .nickname(registerUserDto.nickname())
                .name(registerUserDto.name())
                .email(registerUserDto.email())
                .hashedPassword(passwordEncoder.encode(registerUserDto.password()))
                .gender(registerUserDto.gender())
                .provider(Provider.DEFAULT)
                .phone(registerUserDto.phone())
                .birthDate(registerUserDto.birthDate())
                .build();

        if(registerUserDto.provider()==null) user.setProvider(Provider.DEFAULT);
        else user.setProvider(Provider.valueOf(registerUserDto.provider().toUpperCase()));

        user.setHashedPassword(passwordEncoder.encode(registerUserDto.password()));

        Map<String, Object> attributes = new HashMap<>();

        log.debug("회원가입 제공자. provider={}", registerUserDto.provider());

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


    @Transactional
    public User registerOAuthUser(String email, String name, Provider provider, String profileUrl) {
        String truncatedName = name != null && name.length() > 10 ? name.substring(0, 10) : name;

        // 이메일 prefix를 기반으로 중복 없는 닉네임 생성
        String emailPrefix = email.contains("@") ? email.split("@")[0] : email;
        String baseNickname = emailPrefix.length() > 12 ? emailPrefix.substring(0, 12) : emailPrefix;
        String nickname = baseNickname;
        int suffix = 1;
        while (userRepository.existsByNickname(nickname)) {
            String suffixStr = String.valueOf(suffix++);
            int maxBase = 12 - suffixStr.length();
            nickname = (baseNickname.length() > maxBase ? baseNickname.substring(0, maxBase) : baseNickname) + suffixStr;
        }

        log.info("OAuth 자동 회원가입. email={}, provider={}", email, provider);

        User user = User.builder()
                .email(email)
                .name(truncatedName)
                .nickname(nickname)
                .provider(provider)
                .profileUrl(profileUrl)
                .role(Role.USER)
                .build();

        return userRepository.save(user);
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











