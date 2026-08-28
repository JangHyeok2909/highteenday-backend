package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.schools.School;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplate;
import com.example.highteenday_backend.domain.schools.timetableTamplates.TimetableTemplateRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.BirthDate;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.Password;
import com.example.highteenday_backend.domain.users.vo.PhoneNumber;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.ChangeNicknameDto;
import com.example.highteenday_backend.dtos.ChangePasswordDto;
import com.example.highteenday_backend.dtos.ChangePhoneDto;
import com.example.highteenday_backend.dtos.Login.RegisterUserDto;
import com.example.highteenday_backend.dtos.SchoolIdDto;
import com.example.highteenday_backend.dtos.UserInfoDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Gender;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.enums.Semester;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private TimetableTemplateRepository timetableTemplateRepository;
    @Mock private SchoolService schoolService;

    /** 해시 구현이 아니라 서비스 분기를 보는 테스트이므로 결정적인 가짜 인코더를 쓴다. */
    private final PasswordEncoder passwordEncoder = new PasswordEncoder() {
        @Override
        public String encode(CharSequence rawPassword) {
            return "hashed:" + rawPassword;
        }

        @Override
        public boolean matches(CharSequence rawPassword, String encodedPassword) {
            return encodedPassword != null && encodedPassword.equals("hashed:" + rawPassword);
        }
    };

    private UserService userService;

    private User existing;

    @BeforeEach
    void setUp() {
        userService = new UserService(userRepository, passwordEncoder,
                timetableTemplateRepository, schoolService);

        existing = User.builder()
                .id(1L)
                .email(new Email("user@test.com"))
                .name(new UserName("홍길동"))
                .nickname(new Nickname("gildong"))
                .password(Password.fromHashedValue("hashed:oldPass1!"))
                .phone(new PhoneNumber("010-1111-2222"))
                .provider(Provider.DEFAULT)
                .role(Role.USER)
                .build();

        when(userRepository.findById(1L)).thenReturn(Optional.of(existing));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        when(userRepository.saveAndFlush(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private static void assertErrorCode(Throwable thrown, ErrorCode expected) {
        assertThat(thrown).isInstanceOf(CustomException.class);
        assertThat(((CustomException) thrown).getErrorCode()).isEqualTo(expected);
    }

    // ==================================================================
    // 조회
    // ==================================================================

    @Nested
    @DisplayName("조회")
    class Lookup {

        @Test
        @DisplayName("findById — 없으면 USER_NOT_FOUND")
        void findByIdThrowsWhenMissing() {
            when(userRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.findById(99L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.USER_NOT_FOUND));
        }

        @Test
        @DisplayName("findByEmail — 없으면 USER_NOT_FOUND, 메시지에 email이 담긴다")
        void findByEmailThrowsWhenMissing() {
            when(userRepository.findByEmail("none@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.findByEmail("none@test.com"))
                    .isInstanceOf(CustomException.class)
                    .hasMessageContaining("none@test.com");
        }

        @Test
        @DisplayName("findByNickname — 없으면 USER_NOT_FOUND")
        void findByNicknameThrowsWhenMissing() {
            when(userRepository.findByNickname("nobody")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.findByNickname("nobody"))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.USER_NOT_FOUND));
        }

        @Test
        @DisplayName("getUserInfoDto — 학교/학년/반이 없어도 null로 채워 내려준다")
        void buildsDtoWithNullableFields() {
            when(userRepository.findByEmail("user@test.com")).thenReturn(Optional.of(existing));

            UserInfoDto dto = userService.getUserInfoDto("user@test.com");

            assertThat(dto.id()).isEqualTo(1L);
            assertThat(dto.email()).isEqualTo("user@test.com");
            assertThat(dto.nickname()).isEqualTo("gildong");
            assertThat(dto.phoneNum()).isEqualTo("010-1111-2222");
            assertThat(dto.provider()).isEqualTo("DEFAULT");
            assertThat(dto.schoolName()).isNull();
            assertThat(dto.userGrade()).isNull();
            assertThat(dto.userClass()).isNull();
            assertThat(dto.semester()).isNull();
        }

        @Test
        @DisplayName("getUserInfoDto — 학교/학년/반이 있으면 표시값으로 변환한다")
        void buildsDtoWithSchoolInfo() {
            School school = School.builder().id(5L).name("테스트고등학교").build();
            existing.updateSchool(school);
            existing.updateGrade(Grade.SOPHOMORE);
            existing.updateUserClass(3);
            existing.updateSemester(Semester.FIRST);
            when(userRepository.findByEmail("user@test.com")).thenReturn(Optional.of(existing));

            UserInfoDto dto = userService.getUserInfoDto("user@test.com");

            assertThat(dto.schoolName()).isEqualTo("테스트고등학교");
            assertThat(dto.userGrade()).isEqualTo(Grade.SOPHOMORE.getField());
            assertThat(dto.userClass()).isEqualTo("3");
            assertThat(dto.semester()).isEqualTo(Semester.FIRST.getField());
        }

        @Test
        @DisplayName("getUserInfoDto — 없는 이메일이면 USER_NOT_FOUND")
        void throwsWhenEmailMissing() {
            when(userRepository.findByEmail("none@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.getUserInfoDto("none@test.com"))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.USER_NOT_FOUND));
        }
    }

    // ==================================================================
    // 일반 회원가입
    // ==================================================================

    @Nested
    @DisplayName("register")
    class Register {

        private RegisterUserDto.RegisterUserDtoBuilder validDto() {
            return RegisterUserDto.builder()
                    .name("김철수")
                    .nickname("chulsoo")
                    .phone("010-3333-4444")
                    .email("new@test.com")
                    .gender(Gender.MALE)
                    .password("newPass1!")
                    .birthDate(LocalDate.now().minusYears(17));
        }

        @Test
        @DisplayName("정상 가입 — 비밀번호를 해시로 저장하고 기본 시간표를 만들고 Authentication을 돌려준다")
        void registersUser() {
            when(userRepository.findByEmail("new@test.com")).thenReturn(Optional.empty());

            Authentication authentication = userService.register(validDto().build());

            ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
            verify(userRepository).saveAndFlush(captor.capture());
            User saved = captor.getValue();
            assertThat(saved.getEmailValue()).isEqualTo("new@test.com");
            assertThat(saved.getNicknameValue()).isEqualTo("chulsoo");
            assertThat(saved.getHashedPassword()).isEqualTo("hashed:newPass1!");
            assertThat(saved.getProvider()).isEqualTo(Provider.DEFAULT);

            verify(timetableTemplateRepository).save(any(TimetableTemplate.class));

            // 쿠키는 컨트롤러가 굽는다. 서비스는 그 재료인 Authentication 까지만 만든다.
            assertThat(authentication).isNotNull();
            assertThat(((CustomUserPrincipal) authentication.getPrincipal()).getUserEmail())
                    .isEqualTo("new@test.com");
        }

        @Test
        @DisplayName("기본 시간표는 '기본 시간표' 이름으로 isDefault=true로 만들어진다")
        void createsDefaultTimetableTemplate() {
            when(userRepository.findByEmail("new@test.com")).thenReturn(Optional.empty());

            userService.register(validDto().build());

            ArgumentCaptor<TimetableTemplate> captor =
                    ArgumentCaptor.forClass(TimetableTemplate.class);
            verify(timetableTemplateRepository).save(captor.capture());
            assertThat(captor.getValue().getTemplateName()).isEqualTo("기본 시간표");
            assertThat(captor.getValue().isDefault()).isTrue();
            assertThat(captor.getValue().getGrade()).isEqualTo(Grade.SOPHOMORE);
            assertThat(captor.getValue().getSemester()).isEqualTo(Semester.FIRST);
        }

        @Test
        @DisplayName("이미 가입된 이메일이면 ALREADY_EXISTS_USER")
        void throwsWhenEmailTaken() {
            when(userRepository.findByEmail("new@test.com")).thenReturn(Optional.of(existing));

            assertThatThrownBy(() -> userService.register(validDto().build()))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.ALREADY_EXISTS_USER));

            verify(userRepository, never()).saveAndFlush(any());
        }

        @Test
        @DisplayName("provider가 null이면 DEFAULT로 저장된다")
        void defaultsProviderWhenNull() {
            when(userRepository.findByEmail("new@test.com")).thenReturn(Optional.empty());

            userService.register(validDto().provider(null).build());

            ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
            verify(userRepository).saveAndFlush(captor.capture());
            assertThat(captor.getValue().getProvider()).isEqualTo(Provider.DEFAULT);
        }

        @Test
        @DisplayName("provider 문자열은 대소문자를 가리지 않는다")
        void acceptsLowercaseProvider() {
            when(userRepository.findByEmail("new@test.com")).thenReturn(Optional.empty());

            userService.register(validDto().provider("google").build());

            ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
            verify(userRepository).saveAndFlush(captor.capture());
            assertThat(captor.getValue().getProvider()).isEqualTo(Provider.GOOGLE);
        }

        @Test
        @DisplayName("알 수 없는 provider 문자열은 IllegalArgumentException으로 새어 나간다")
        void unknownProviderLeaksIllegalArgumentException() {
            // Provider.valueOf 가 그대로 던지므로 CustomException이 아니라 500으로 떨어진다.
            // 현재 동작을 고정해 둔다 — 검증을 추가하려면 이 테스트를 함께 고쳐야 한다.
            when(userRepository.findByEmail("new@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.register(validDto().provider("facebook").build()))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @ParameterizedTest
        @ValueSource(strings = {"short1!", "nodigit!!", "nospecial1"})
        @DisplayName("비밀번호 규칙을 어기면 INVALID_PASSWORD_FORMAT — 저장하지 않는다")
        void rejectsInvalidPassword(String password) {
            when(userRepository.findByEmail("new@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.register(validDto().password(password).build()))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_PASSWORD_FORMAT));

            verify(userRepository, never()).saveAndFlush(any());
        }

        @Test
        @DisplayName("닉네임 규칙을 어기면 INVALID_NICKNAME_FORMAT")
        void rejectsInvalidNickname() {
            when(userRepository.findByEmail("new@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.register(validDto().nickname("a").build()))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_NICKNAME_FORMAT));
        }

        @Test
        @DisplayName("15세 미만이면 INVALID_BIRTHDATE")
        void rejectsUnderageBirthDate() {
            when(userRepository.findByEmail("new@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.register(
                    validDto().birthDate(LocalDate.now().minusYears(10)).build()))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_BIRTHDATE));
        }
    }

    // ==================================================================
    // OAuth 자동 가입 — 닉네임 충돌 루프
    // ==================================================================

    @Nested
    @DisplayName("registerOAuthUser")
    class OAuthRegistration {

        @Test
        @DisplayName("이메일 prefix를 닉네임으로 쓴다")
        void usesEmailPrefixAsNickname() {
            when(userRepository.existsByNickname(anyString())).thenReturn(false);

            User result = userService.registerOAuthUser(
                    "chulsoo@gmail.com", "김철수", Provider.GOOGLE, "https://img/p.png");

            assertThat(result.getNicknameValue()).isEqualTo("chulsoo");
            assertThat(result.getProvider()).isEqualTo(Provider.GOOGLE);
            assertThat(result.getProfileUrl()).isEqualTo("https://img/p.png");
            verify(timetableTemplateRepository).save(any(TimetableTemplate.class));
        }

        @Test
        @DisplayName("prefix가 12자를 넘으면 12자로 자른다")
        void truncatesLongPrefixToTwelve() {
            when(userRepository.existsByNickname(anyString())).thenReturn(false);

            User result = userService.registerOAuthUser(
                    "verylongemailprefix@gmail.com", "김철수", Provider.GOOGLE, null);

            assertThat(result.getNicknameValue()).isEqualTo("verylongemai");
            assertThat(result.getNicknameValue()).hasSize(12);
        }

        @Test
        @DisplayName("닉네임이 이미 있으면 숫자 접미사를 붙여 피한다")
        void appendsSuffixOnCollision() {
            Set<String> taken = new HashSet<>(Set.of("chulsoo"));
            when(userRepository.existsByNickname(anyString()))
                    .thenAnswer(inv -> taken.contains(inv.getArgument(0)));

            User result = userService.registerOAuthUser(
                    "chulsoo@gmail.com", "김철수", Provider.GOOGLE, null);

            assertThat(result.getNicknameValue()).isEqualTo("chulsoo1");
        }

        @Test
        @DisplayName("접미사가 두 자리로 넘어가도 12자를 넘지 않는다 — substring 계산 경계")
        void keepsNicknameWithinTwelveCharsWhenSuffixGrows() {
            // 12자 prefix + 접미사 1~10 을 모두 선점해 두 자리 접미사까지 밀어붙인다.
            Set<String> taken = new HashSet<>();
            taken.add("verylongemai");
            for (int i = 1; i <= 9; i++) {
                taken.add("verylongema" + i);   // 11자 base + 1자리 접미사
            }
            when(userRepository.existsByNickname(anyString()))
                    .thenAnswer(inv -> taken.contains(inv.getArgument(0)));

            User result = userService.registerOAuthUser(
                    "verylongemailprefix@gmail.com", "김철수", Provider.GOOGLE, null);

            assertThat(result.getNicknameValue()).isEqualTo("verylongem10");
            assertThat(result.getNicknameValue()).hasSize(12);
        }

        @Test
        @DisplayName("@ 없는 이메일은 Email 검증에서 막힌다 — 닉네임 fallback 분기는 도달할 수 없다")
        void rejectsEmailWithoutAtSign() {
            // registerOAuthUser 에는 email.contains("@") 가 false인 경우를 위한 분기가 있지만,
            // 그 뒤 new Email(email) 이 반드시 INVALID_EMAIL_FORMAT 을 던지므로 그 분기는
            // 결과에 영향을 줄 수 없다. 즉 죽은 방어 코드다.
            when(userRepository.existsByNickname(anyString())).thenReturn(false);

            assertThatThrownBy(() -> userService.registerOAuthUser(
                    "noatsign", "김철수", Provider.KAKAO, null))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_EMAIL_FORMAT));
        }

        @Test
        @DisplayName("이름이 null이어도 UserName 검증에서 막힌다")
        void rejectsNullName() {
            when(userRepository.existsByNickname(anyString())).thenReturn(false);

            assertThatThrownBy(() -> userService.registerOAuthUser(
                    "chulsoo@gmail.com", null, Provider.GOOGLE, null))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_NAME_FORMAT));
        }

        @Test
        @DisplayName("이메일 prefix가 1자면 닉네임 검증에서 막힌다 — OAuth 가입이 실패한다")
        void failsWhenEmailPrefixTooShort() {
            // Nickname 은 2자 이상을 요구하는데 prefix 길이를 보정하지 않는다.
            // 실제로 a@gmail.com 같은 계정은 자동 가입이 되지 않는다. 현재 동작을 고정해 둔다.
            when(userRepository.existsByNickname(anyString())).thenReturn(false);

            assertThatThrownBy(() -> userService.registerOAuthUser(
                    "a@gmail.com", "김철수", Provider.GOOGLE, null))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_NICKNAME_FORMAT));
        }

        @ParameterizedTest
        @ValueSource(ints = {9, 10, 11, 15, 40})
        @DisplayName("8자를 넘는 이름은 8자로 잘려 가입이 성공한다 — UserName 상한과 맞춘다")
        void truncatesLongNameToEightChars(int nameLength) {
            when(userRepository.existsByNickname(anyString())).thenReturn(false);

            User result = userService.registerOAuthUser(
                    "chulsoo@gmail.com", "가".repeat(nameLength), Provider.GOOGLE, null);

            assertThat(result.getNameValue()).hasSize(8);
        }

        @ParameterizedTest
        @ValueSource(ints = {2, 5, 8})
        @DisplayName("8자 이하 이름은 그대로 보존된다")
        void keepsShortNameAsIs(int nameLength) {
            when(userRepository.existsByNickname(anyString())).thenReturn(false);
            String name = "가".repeat(nameLength);

            User result = userService.registerOAuthUser(
                    "chulsoo@gmail.com", name, Provider.GOOGLE, null);

            assertThat(result.getNameValue()).isEqualTo(name);
        }
    }

    // ==================================================================
    // 비밀번호
    // ==================================================================

    @Nested
    @DisplayName("verifyPassword")
    class VerifyPassword {

        @Test
        @DisplayName("일치하면 true")
        void returnsTrueWhenMatching() {
            assertThat(userService.verifyPassword(existing, "oldPass1!")).isTrue();
        }

        @Test
        @DisplayName("다르면 false")
        void returnsFalseWhenMismatched() {
            assertThat(userService.verifyPassword(existing, "wrong1!")).isFalse();
        }

        @Test
        @DisplayName("비밀번호가 없는 계정(OAuth)이면 INVALID_REQUEST")
        void throwsWhenNoPassword() {
            User oauthUser = User.builder()
                    .id(2L)
                    .email(new Email("oauth@test.com"))
                    .name(new UserName("김철수"))
                    .nickname(new Nickname("oauth"))
                    .provider(Provider.GOOGLE)
                    .role(Role.USER)
                    .build();

            assertThatThrownBy(() -> userService.verifyPassword(oauthUser, "any"))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_REQUEST));
        }
    }

    @Nested
    @DisplayName("updatePassword")
    class UpdatePassword {

        @Test
        @DisplayName("정상 변경 — 새 비밀번호가 해시로 저장된다")
        void updatesPassword() {
            userService.updatePassword(1L, new ChangePasswordDto("oldPass1!", "newPass2!"));

            assertThat(existing.getHashedPassword()).isEqualTo("hashed:newPass2!");
            verify(userRepository).save(existing);
        }

        @Test
        @DisplayName("현재 비밀번호가 틀리면 INVALID_PASSWORD")
        void throwsWhenCurrentPasswordWrong() {
            assertThatThrownBy(() -> userService.updatePassword(1L,
                    new ChangePasswordDto("wrongPass1!", "newPass2!")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_PASSWORD));

            assertThat(existing.getHashedPassword()).isEqualTo("hashed:oldPass1!");
        }

        @Test
        @DisplayName("새 비밀번호가 현재와 같으면 SAME_AS_CURRENT_PASSWORD")
        void throwsWhenSameAsCurrent() {
            assertThatThrownBy(() -> userService.updatePassword(1L,
                    new ChangePasswordDto("oldPass1!", "oldPass1!")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.SAME_AS_CURRENT_PASSWORD));

            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("없는 사용자면 USER_NOT_FOUND")
        void throwsWhenUserMissing() {
            when(userRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.updatePassword(99L,
                    new ChangePasswordDto("oldPass1!", "newPass2!")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.USER_NOT_FOUND));
        }

        @ParameterizedTest
        @ValueSource(strings = {"weak", "nodigit!!", "nospecial1"})
        @DisplayName("새 비밀번호가 규칙을 어기면 INVALID_PASSWORD_FORMAT이 그대로 올라온다")
        void propagatesFormatError(String newPassword) {
            // 도메인 예외를 catch(Exception) 이 삼켜 500으로 바꾸지 않는지 확인한다.
            assertThatThrownBy(() -> userService.updatePassword(1L,
                    new ChangePasswordDto("oldPass1!", newPassword)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_PASSWORD_FORMAT));

            assertThat(existing.getHashedPassword()).isEqualTo("hashed:oldPass1!");
        }

        @Test
        @DisplayName("저장 중 예기치 못한 예외는 INTERNAL_ERROR로 감싼다")
        void wrapsUnexpectedSaveFailure() {
            when(userRepository.save(any(User.class)))
                    .thenThrow(new IllegalStateException("boom"));

            assertThatThrownBy(() -> userService.updatePassword(1L,
                    new ChangePasswordDto("oldPass1!", "newPass2!")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INTERNAL_ERROR));
        }
    }

    // ==================================================================
    // 닉네임
    // ==================================================================

    @Nested
    @DisplayName("updateNickname")
    class UpdateNickname {

        @Test
        @DisplayName("정상 변경")
        void updatesNickname() {
            when(userRepository.existsByNickname("newNick")).thenReturn(false);

            userService.updateNickname(1L, new ChangeNicknameDto("gildong", "newNick"));

            assertThat(existing.getNicknameValue()).isEqualTo("newNick");
            verify(userRepository).save(existing);
        }

        @Test
        @DisplayName("이전과 같으면 SAME_AS_NICKNAME — 중복 조회조차 하지 않는다")
        void throwsWhenSameAsBefore() {
            assertThatThrownBy(() -> userService.updateNickname(1L,
                    new ChangeNicknameDto("gildong", "gildong")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.SAME_AS_NICKNAME));

            verify(userRepository, never()).existsByNickname(anyString());
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("이미 쓰이는 닉네임이면 DUPLICATE_NICKNAME")
        void throwsWhenDuplicate() {
            when(userRepository.existsByNickname("taken")).thenReturn(true);

            assertThatThrownBy(() -> userService.updateNickname(1L,
                    new ChangeNicknameDto("gildong", "taken")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.DUPLICATE_NICKNAME));

            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("13자 이상이면 INVALID_NICKNAME_FORMAT")
        void throwsWhenTooLong() {
            when(userRepository.existsByNickname(anyString())).thenReturn(false);

            assertThatThrownBy(() -> userService.updateNickname(1L,
                    new ChangeNicknameDto("gildong", "a".repeat(13))))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_NICKNAME_FORMAT));
        }

        @Test
        @DisplayName("12자는 허용된다 — 상한 경계")
        void allowsExactlyTwelveChars() {
            when(userRepository.existsByNickname(anyString())).thenReturn(false);

            userService.updateNickname(1L, new ChangeNicknameDto("gildong", "a".repeat(12)));

            assertThat(existing.getNicknameValue()).hasSize(12);
        }

        @ParameterizedTest
        @ValueSource(strings = {"a", ""})
        @DisplayName("2자 미만 닉네임은 INVALID_NICKNAME_FORMAT이 그대로 올라온다")
        void propagatesTooShortNicknameError(String newNickname) {
            // 서비스에는 하한 검사가 없지만 Nickname VO가 막고, 그 예외가 삼켜지지 않아야 한다.
            when(userRepository.existsByNickname(anyString())).thenReturn(false);

            assertThatThrownBy(() -> userService.updateNickname(1L,
                    new ChangeNicknameDto("gildong", newNickname)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_NICKNAME_FORMAT));

            assertThat(existing.getNicknameValue()).isEqualTo("gildong");
        }

        @Test
        @DisplayName("저장 중 예기치 못한 예외는 INTERNAL_ERROR로 감싼다")
        void wrapsUnexpectedSaveFailure() {
            when(userRepository.existsByNickname(anyString())).thenReturn(false);
            when(userRepository.save(any(User.class)))
                    .thenThrow(new IllegalStateException("boom"));

            assertThatThrownBy(() -> userService.updateNickname(1L,
                    new ChangeNicknameDto("gildong", "newNick")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INTERNAL_ERROR));
        }
    }

    // ==================================================================
    // 전화번호 / 학교
    // ==================================================================

    @Nested
    @DisplayName("updatePhone")
    class UpdatePhone {

        @Test
        @DisplayName("정상 변경")
        void updatesPhone() {
            when(userRepository.existsByPhone("010-5555-6666")).thenReturn(false);

            userService.updatePhone(1L, new ChangePhoneDto("010-5555-6666"));

            assertThat(existing.getPhoneValue()).isEqualTo("010-5555-6666");
            verify(userRepository).save(existing);
        }

        @Test
        @DisplayName("이미 쓰이는 번호면 DUPLICATE_PHONE — 사용자 조회 전에 막는다")
        void throwsWhenDuplicate() {
            when(userRepository.existsByPhone("010-5555-6666")).thenReturn(true);

            assertThatThrownBy(() -> userService.updatePhone(1L,
                    new ChangePhoneDto("010-5555-6666")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.DUPLICATE_PHONE));

            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("형식이 틀리면 INVALID_PHONE_FORMAT")
        void throwsWhenInvalidFormat() {
            when(userRepository.existsByPhone(anyString())).thenReturn(false);

            assertThatThrownBy(() -> userService.updatePhone(1L,
                    new ChangePhoneDto("01055556666")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_PHONE_FORMAT));
        }

        @Test
        @DisplayName("phone이 null이면 중복 검사는 건너뛰지만 VO 검증에서 막힌다")
        void nullPhoneSkipsDuplicateCheckButFailsValidation() {
            // 번호를 지우는 요청으로 읽히지만 PhoneNumber 가 null을 허용하지 않아 400이 된다.
            assertThatThrownBy(() -> userService.updatePhone(1L, new ChangePhoneDto(null)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.INVALID_PHONE_FORMAT));

            verify(userRepository, never()).existsByPhone(anyString());
        }
    }

    @Nested
    @DisplayName("updateSchool")
    class UpdateSchool {

        @Test
        @DisplayName("학교·학년·반을 함께 갱신한다")
        void updatesSchoolGradeAndClass() {
            School school = School.builder().id(7L).name("테스트고등학교").build();
            when(schoolService.findById(7L)).thenReturn(school);

            userService.updateSchool(1L, new SchoolIdDto("7", Grade.JUNIOR, 4));

            assertThat(existing.getSchool()).isSameAs(school);
            assertThat(existing.getGrade()).isEqualTo(Grade.JUNIOR);
            assertThat(existing.getUserClass()).isEqualTo(4);
            verify(userRepository).save(existing);
        }

        @Test
        @DisplayName("schoolId가 숫자가 아니면 NumberFormatException으로 새어 나간다")
        void nonNumericSchoolIdLeaksNumberFormatException() {
            // Long.parseLong 결과를 검증하지 않아 CustomException이 아니라 500으로 떨어진다.
            // 현재 동작을 고정해 둔다.
            assertThatThrownBy(() -> userService.updateSchool(1L,
                    new SchoolIdDto("not-a-number", Grade.JUNIOR, 4)))
                    .isInstanceOf(NumberFormatException.class);
        }

        @Test
        @DisplayName("없는 사용자면 USER_NOT_FOUND")
        void throwsWhenUserMissing() {
            when(userRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.updateSchool(99L,
                    new SchoolIdDto("7", Grade.JUNIOR, 4)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.USER_NOT_FOUND));
        }
    }

    // ==================================================================
    // 회원 탈퇴
    // ==================================================================

    @Nested
    @DisplayName("deleteAccount")
    class DeleteAccount {

        @BeforeEach
        void setUp() {
            when(userRepository.findByEmail("user@test.com")).thenReturn(Optional.of(existing));
        }

        // 아래 테스트들은 KI-34 로 물리 삭제 → soft delete 전환된 뒤의 계약이다.
        // 예전에는 `userRepository.delete()` 호출과 그때 나는 FK 위반·JPA 오류의
        // ErrorCode 변환을 고정하고 있었다. DELETE 를 하지 않으므로 그 예외들은
        // 더 이상 발생할 수 없어, 해당 테스트는 함께 제거했다.

        @Test
        @DisplayName("정상 탈퇴 — 행을 지우지 않고 지움 표시만 한다")
        void marksUserAsWithdrawnWithoutDeleting() {
            userService.deleteAccount(existing);

            assertThat(existing.getIsValid()).isFalse();
            verify(userRepository, never()).delete(any(User.class));
            verify(userRepository, never()).deleteById(anyLong());
        }

        @Test
        @DisplayName("탈퇴하면 이메일이 표식값으로 비켜 같은 이메일로 재가입할 수 있다")
        void releasesEmailForReRegistration() {
            userService.deleteAccount(existing);

            assertThat(existing.getEmailValue())
                    .as("원래 이메일이 남아 있으면 중복 제약 때문에 재가입이 막힌다")
                    .isNotEqualTo("user@test.com")
                    .isEqualTo("deleted-1@deleted.invalid");
        }

        @Test
        @DisplayName("없는 사용자면 USER_NOT_FOUND")
        void throwsWhenUserMissing() {
            when(userRepository.findByEmail("user@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> userService.deleteAccount(existing))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.USER_NOT_FOUND));
        }
    }

    // ==================================================================
    // 중복 확인
    // ==================================================================

    @Nested
    @DisplayName("존재 확인")
    class ExistenceChecks {

        @Test
        @DisplayName("existsByNickname / existsByEmail / existsByPhone 는 저장소 결과를 그대로 전달한다")
        void delegatesToRepository() {
            when(userRepository.existsByNickname("nick")).thenReturn(true);
            when(userRepository.existsByEmail("a@test.com")).thenReturn(false);
            when(userRepository.existsByPhone("010-1111-2222")).thenReturn(true);

            assertThat(userService.existsByNickname("nick")).isTrue();
            assertThat(userService.existsByEmail("a@test.com")).isFalse();
            assertThat(userService.existsByPhone("010-1111-2222")).isTrue();
        }
    }
}
