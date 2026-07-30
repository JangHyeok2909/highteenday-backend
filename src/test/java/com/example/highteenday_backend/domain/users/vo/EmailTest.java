package com.example.highteenday_backend.domain.users.vo;

import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EmailTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "user@test.com",
            "user.name@test.com",
            "user-name@test.co.kr",
            "user_name@sub.domain.test.com",
            "a@b.io"
    })
    @DisplayName("유효한 형식은 그대로 보관된다")
    void acceptsValidFormats(String raw) {
        assertThat(new Email(raw).getValue()).isEqualTo(raw);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
            "",
            "plainstring",
            "@test.com",          // local part 없음
            "user@",              // 도메인 없음
            "user@test",          // TLD 없음
            "user@test.c",        // TLD 1글자 — 정규식은 2글자 이상만 허용
            "user@test.123",      // 숫자 TLD
            "user name@test.com", // 공백
            "user@@test.com"
    })
    @DisplayName("유효하지 않은 형식은 INVALID_EMAIL_FORMAT")
    void rejectsInvalidFormats(String raw) {
        assertThatThrownBy(() -> new Email(raw))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_EMAIL_FORMAT));
    }

    @Test
    @DisplayName("같은 값이면 동등하다 — @Embeddable 값 비교에 의존하는 코드가 있다")
    void equalsByValue() {
        assertThat(new Email("user@test.com"))
                .isEqualTo(new Email("user@test.com"))
                .hasSameHashCodeAs(new Email("user@test.com"));
        assertThat(new Email("user@test.com")).isNotEqualTo(new Email("other@test.com"));
    }
}
