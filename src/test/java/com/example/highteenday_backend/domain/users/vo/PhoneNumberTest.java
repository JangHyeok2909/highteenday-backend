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

class PhoneNumberTest {

    @ParameterizedTest
    @ValueSource(strings = {"010-1234-5678", "010-0000-0000", "010-9999-9999"})
    @DisplayName("010-####-#### 형식은 허용된다")
    void acceptsValidFormat(String raw) {
        assertThat(new PhoneNumber(raw).getValue()).isEqualTo(raw);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
            "",
            "01012345678",     // 하이픈 없음
            "010-123-5678",    // 가운데 3자리
            "010-12345-678",   // 가운데 5자리
            "010-1234-567",    // 마지막 3자리
            "010-1234-56789",  // 마지막 5자리
            "011-1234-5678",   // 010 이외의 국번
            "10-1234-5678",    // 앞자리 누락
            "+82-10-1234-5678",// 국가번호 형식
            "010-1234-5678 ",  // 뒤 공백
            " 010-1234-5678",  // 앞 공백
            "010-abcd-5678"    // 숫자 아님
    })
    @DisplayName("010-####-#### 형식이 아니면 INVALID_PHONE_FORMAT")
    void rejectsInvalidFormat(String raw) {
        assertThatThrownBy(() -> new PhoneNumber(raw))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_PHONE_FORMAT));
    }

    @Test
    @DisplayName("null을 허용하지 않는다 — 전화번호 컬럼은 nullable이지만 VO는 null을 막는다")
    void rejectsNullEvenThoughColumnIsNullable() {
        // UserService.updatePhone 이 dto.phone() == null 인 경우에도 new PhoneNumber(null) 을
        // 호출하므로, 전화번호를 지우는 요청은 400으로 떨어진다. 현재 동작을 고정해 둔다.
        assertThatThrownBy(() -> new PhoneNumber(null))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_PHONE_FORMAT));
    }

    @Test
    @DisplayName("같은 값이면 동등하다")
    void equalsByValue() {
        assertThat(new PhoneNumber("010-1234-5678"))
                .isEqualTo(new PhoneNumber("010-1234-5678"))
                .hasSameHashCodeAs(new PhoneNumber("010-1234-5678"));
    }
}
