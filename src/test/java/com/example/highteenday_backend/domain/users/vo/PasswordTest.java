package com.example.highteenday_backend.domain.users.vo;

import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasswordTest {

    /** 해시 알고리즘이 아니라 검증 규칙을 보는 테스트이므로 인코더는 결정적인 가짜를 쓴다. */
    private PasswordEncoder encoder;

    @BeforeEach
    void setUp() {
        encoder = new PasswordEncoder() {
            @Override
            public String encode(CharSequence rawPassword) {
                return "hashed:" + rawPassword;
            }

            @Override
            public boolean matches(CharSequence rawPassword, String encodedPassword) {
                return encodedPassword != null && encodedPassword.equals("hashed:" + rawPassword);
            }
        };
    }

    @Nested
    @DisplayName("fromRawPassword")
    class FromRawPassword {

        @ParameterizedTest
        @ValueSource(strings = {
                "abcd123!",          // 8자 하한 경계
                "password1!",
                "Passw0rd@2024",
                "12345678,",         // 특수문자 쉼표
                "aaaaaaa1:"          // 특수문자 콜론
        })
        @DisplayName("8자 이상 + 숫자 + 특수문자를 모두 만족하면 해시로 저장된다")
        void encodesValidPassword(String raw) {
            Password password = Password.fromRawPassword(raw, encoder);

            assertThat(password.getHashedValue()).isEqualTo("hashed:" + raw);
            // 원문이 그대로 남아 있지 않은지 확인 — 평문 저장 회귀 방지
            assertThat(password.getHashedValue()).isNotEqualTo(raw);
        }

        @ParameterizedTest
        @NullSource
        @ValueSource(strings = {
                "",
                "a1!",            // 3자
                "abc123!",        // 7자 — 하한 경계 바로 밖
                "abcdefgh!",      // 숫자 없음
                "abcd1234",       // 특수문자 없음
                "abcdefghij",     // 숫자·특수문자 모두 없음
                "12345678"        // 특수문자 없음
        })
        @DisplayName("규칙을 하나라도 어기면 INVALID_PASSWORD_FORMAT")
        void rejectsInvalidPassword(String raw) {
            assertThatThrownBy(() -> Password.fromRawPassword(raw, encoder))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_PASSWORD_FORMAT));
        }

        @Test
        @DisplayName("검증 실패 시 인코더를 호출하지 않는다")
        void doesNotEncodeWhenInvalid() {
            PasswordEncoder throwingEncoder = new PasswordEncoder() {
                @Override
                public String encode(CharSequence rawPassword) {
                    throw new AssertionError("검증 실패한 비밀번호를 인코딩하려 했다");
                }

                @Override
                public boolean matches(CharSequence rawPassword, String encodedPassword) {
                    return false;
                }
            };

            assertThatThrownBy(() -> Password.fromRawPassword("short", throwingEncoder))
                    .isInstanceOf(CustomException.class);
        }

        @Test
        @DisplayName("허용 특수문자 집합 밖의 기호는 특수문자로 인정되지 않는다")
        void rejectsSpecialCharsOutsideAllowedSet() {
            // 규칙상 허용 집합은 !@#$%^&*(),.?":{}|<> 이다.
            // '-', '_', '+', '=', '[', ']', ';', '/' 등은 여기에 없다.
            assertThatThrownBy(() -> Password.fromRawPassword("abcd1234-", encoder))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_PASSWORD_FORMAT));
            assertThatThrownBy(() -> Password.fromRawPassword("abcd1234_", encoder))
                    .isInstanceOf(CustomException.class);
        }
    }

    @Nested
    @DisplayName("fromHashedValue")
    class FromHashedValue {

        @Test
        @DisplayName("DB에서 복원할 때는 형식 검증을 하지 않는다")
        void skipsValidation() {
            // 이미 해시된 값이 평문 규칙을 만족할 이유가 없으므로 검증을 건너뛰는 것이 맞다.
            Password password = Password.fromHashedValue("$2a$10$abcdefg");

            assertThat(password.getHashedValue()).isEqualTo("$2a$10$abcdefg");
        }

        @Test
        @DisplayName("null 해시도 그대로 보관한다 — OAuth 사용자는 비밀번호가 없다")
        void allowsNullHash() {
            assertThat(Password.fromHashedValue(null).getHashedValue()).isNull();
        }
    }

    @Nested
    @DisplayName("matches")
    class Matches {

        @Test
        @DisplayName("원문이 일치하면 true")
        void returnsTrueOnMatch() {
            Password password = Password.fromRawPassword("password1!", encoder);

            assertThat(password.matches("password1!", encoder)).isTrue();
        }

        @Test
        @DisplayName("원문이 다르면 false")
        void returnsFalseOnMismatch() {
            Password password = Password.fromRawPassword("password1!", encoder);

            assertThat(password.matches("password2!", encoder)).isFalse();
        }
    }
}
