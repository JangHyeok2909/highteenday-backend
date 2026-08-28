package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplateRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.*;
import com.example.highteenday_backend.dtos.ChangeNicknameDto;
import com.example.highteenday_backend.dtos.ChangePasswordDto;
import com.example.highteenday_backend.dtos.ChangePhoneDto;
import com.example.highteenday_backend.dtos.SchoolIdDto;
import com.example.highteenday_backend.dtos.UserInfoDto;
import com.example.highteenday_backend.dtos.Login.RegisterUserDto;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Semester;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.SchoolService;
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
    private final TimetableTemplateRepository timetableTemplateRepository;
    private final SchoolService schoolService;

    public User findById(Long userId){
        return userRepository.findById(userId)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
    }
    public User findByEmail(String email){
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND,"존재하지 않는 유저, email="+email));
    }
    public User findByNickname(String nickname){
        return userRepository.findByNickname(nickname)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND,"존재하지 않는 유저, nickname="+nickname));
    }

    @Transactional(readOnly = true)
    public UserInfoDto getUserInfoDto(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND, "존재하지 않는 유저, email=" + email));
        String schoolName = user.getSchool() != null ? user.getSchool().getName() : null;
        return UserInfoDto.builder()
                .id(user.getId())
                .name(user.getNameValue())
                .email(user.getEmailValue())
                .nickname(user.getNicknameValue())
                .profileUrl(user.getProfileUrl())
                .provider(user.getProvider().toString())
                .schoolName(schoolName)
                .phoneNum(user.getPhoneValue())
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

    /**
     * 회원가입. 가입된 사용자의 Authentication 을 돌려주고, 쿠키를 굽는 것은 호출한
     * 컨트롤러가 한다. 도메인 서비스가 HttpServletResponse 를 받으면 웹 계층 관심사가
     * 역류해 재사용·테스트가 어려워진다.
     */
    @Transactional
    public Authentication register(RegisterUserDto registerUserDto) {
        String email = registerUserDto.email();

        if (userRepository.findByEmail(email).isPresent()) {
            throw new CustomException(ErrorCode.ALREADY_EXISTS_USER);
        }

        log.info("User registration in progress. nickname={}, email={}", registerUserDto.nickname(), registerUserDto.email());

        Provider provider = (registerUserDto.provider() == null)
                ? Provider.DEFAULT
                : Provider.valueOf(registerUserDto.provider().toUpperCase());

        User user = User.createDefault(
                new Email(registerUserDto.email()),
                new UserName(registerUserDto.name()),
                new Nickname(registerUserDto.nickname()),
                Password.fromRawPassword(registerUserDto.password(), passwordEncoder),
                registerUserDto.gender(),
                new BirthDate(registerUserDto.birthDate()),
                new PhoneNumber(registerUserDto.phone())
        );
        user.updateProvider(provider);

        Map<String, Object> attributes = new HashMap<>();

        log.debug("Registration provider. provider={}", registerUserDto.provider());

        if (user.getProvider()==Provider.DEFAULT) {
            attributes = Collections.emptyMap();
        } else {
            attributes.put("email", email);
            attributes.put("name", registerUserDto.name());
            attributes.put("provider", registerUserDto.provider());
        }

        // 저장 후 토큰 발급하기 위한 처리 코드
        User savedUser = userRepository.saveAndFlush(user);
        //기본 시간표 템플릿 할당
        createDefaultTimetableTemplate(savedUser);

        CustomUserPrincipal userDetails = new CustomUserPrincipal(savedUser, attributes, false);

        return new UsernamePasswordAuthenticationToken(
                userDetails,
                null,
                userDetails.getAuthorities()
        );
    }


    @Transactional
    public User registerOAuthUser(String email, String name, Provider provider, String profileUrl) {
        // UserName 은 8자까지만 받는다. 10자로 자르면 9~10자 이름이 검증에서 걸려 가입이 실패했다.
        String truncatedName = name != null && name.length() > 8 ? name.substring(0, 8) : name;

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

        log.info("OAuth auto-registration. email={}, provider={}", email, provider);

        User user = User.createOAuth(
                new Email(email),
                new UserName(truncatedName),
                new Nickname(nickname),
                provider,
                profileUrl
        );

        User savedUser = userRepository.save(user);

        createDefaultTimetableTemplate(savedUser);

        return savedUser;
    }

    private void createDefaultTimetableTemplate(User user) {
        TimetableTemplate defaultTemplate = TimetableTemplate.builder()
                .user(user)
                .templateName("기본 시간표")
                .grade(Grade.SOPHOMORE)
                .semester(Semester.FIRST)
                .isDefault(true)
                .build();
        timetableTemplateRepository.save(defaultTemplate);
    }

    // 회원 탈퇴
    @Transactional
    public void deleteAccount(User user){
        // 두번 검사하는거임, 하지말까 유난인가?
        User findUser = userRepository.findByEmail(user.getEmailValue())
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

    // 현재 비밀번호 일치 여부 확인
    public boolean verifyPassword(User user, String password) {
        if (user.getHashedPassword() == null) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }
        return passwordEncoder.matches(password, user.getHashedPassword());
    }

    // 비밀번호 변경 | 정규표현식 적용 가능
    @Transactional
    public void updatePassword(Long userId, ChangePasswordDto passwordDto) {
        User user = findById(userId);
        if (!passwordEncoder.matches(passwordDto.pastPassword(), user.getHashedPassword())) {
            throw new CustomException(ErrorCode.INVALID_PASSWORD);
        } else if (passwordDto.pastPassword().equals(passwordDto.newPassword())) {
            throw new CustomException(ErrorCode.SAME_AS_CURRENT_PASSWORD);
        }

        try {
            user.changePassword(Password.fromRawPassword(passwordDto.newPassword(), passwordEncoder));
            userRepository.save(user);
        } catch (CustomException e) {
            // 형식 위반 같은 도메인 오류는 그대로 올린다. 삼키면 400이어야 할 응답이 500이 된다.
            throw e;
        } catch (Exception e) {
            throw new CustomException(ErrorCode.INTERNAL_ERROR);
        }
    }

    // 닉네임 변경
    @Transactional
    public void updateNickname(Long userId, ChangeNicknameDto nicknameDto) {
        // 이전과 같은지 검사
        if (nicknameDto.pastNickname().equals(nicknameDto.newNickname())) {
            throw new CustomException(ErrorCode.SAME_AS_NICKNAME);
        } else if(userRepository.existsByNickname(nicknameDto.newNickname())) { // 닉네임이 존재하는지 검사
            throw new CustomException(ErrorCode.DUPLICATE_NICKNAME);
        } else if(nicknameDto.newNickname().length() > 12) { // 닉네임 길이 제한
            throw new CustomException(ErrorCode.INVALID_NICKNAME_FORMAT);
        }

        User user = findById(userId);
        try {
            user.changeNickname(new Nickname(nicknameDto.newNickname()));
            userRepository.save(user);
        } catch (CustomException e){
            // 형식 위반 같은 도메인 오류는 그대로 올린다. 삼키면 400이어야 할 응답이 500이 된다.
            throw e;
        } catch (Exception e){
            throw new CustomException(ErrorCode.INTERNAL_ERROR);
        }
    }

    @Transactional
    public void updatePhone(Long userId, ChangePhoneDto dto) {
        if (dto.phone() != null && userRepository.existsByPhone(dto.phone())) {
            throw new CustomException(ErrorCode.DUPLICATE_PHONE);
        }
        User user = findById(userId);
        log.info("Phone number updated. userId={}", user.getId());
        user.changePhone(new PhoneNumber(dto.phone()));
        userRepository.save(user);
    }

    @Transactional
    public void updateSchool(Long userId, SchoolIdDto dto) {
        User user = findById(userId);
        log.info("School/grade/class updated. userId={}, schoolId={}, grade={}, class={}",
                user.getId(), dto.schoolId(), dto.grade(), dto.userClass());
        user.updateSchool(schoolService.findById(Long.parseLong(dto.schoolId())));
        user.updateGrade(dto.grade());
        user.updateUserClass(dto.userClass());
        userRepository.save(user);
    }

}











