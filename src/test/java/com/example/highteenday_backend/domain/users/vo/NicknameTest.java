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

class NicknameTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "ab",           // 하한 경계 2자
            "홍길동",
            "nick123",
            "가나다라마바사아자차카타"  // 상한 경계 12자
    })
    @DisplayName("2~12자는 허용된다")
    void acceptsLengthWithinRange(String raw) {
        assertThat(new Nickname(raw).getValue()).isEqualTo(raw);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
            "",                        // 0자
            "a",                       // 1자 — 하한 경계 바로 밖
            "가나다라마바사아자차카타파"  // 13자 — 상한 경계 바로 밖
    })
    @DisplayName("2자 미만 또는 12자 초과는 INVALID_NICKNAME_FORMAT")
    void rejectsLengthOutOfRange(String raw) {
        assertThatThrownBy(() -> new Nickname(raw))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_NICKNAME_FORMAT));
    }

    @Test
    @DisplayName("길이는 문자 수로 센다 — 12자 한글은 통과하고 DB 컬럼 길이(12)와 일치한다")
    void countsCharactersNotBytes() {
        String twelveHangul = "가나다라마바사아자차카타";
        assertThat(twelveHangul).hasSize(12);
        assertThat(new Nickname(twelveHangul).getValue()).isEqualTo(twelveHangul);
    }

    @Test
    @DisplayName("공백을 trim 하지 않는다 — 앞뒤 공백이 그대로 저장된다")
    void doesNotTrim() {
        assertThat(new Nickname(" ab ").getValue()).isEqualTo(" ab ");
    }

    @Test
    @DisplayName("같은 값이면 동등하다")
    void equalsByValue() {
        assertThat(new Nickname("nick"))
                .isEqualTo(new Nickname("nick"))
                .hasSameHashCodeAs(new Nickname("nick"));
    }
}
