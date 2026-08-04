package com.example.highteenday_backend.domain.users.vo;

import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * BirthDate 는 LocalDate.now() 에 직접 의존하므로, 기준일을 주입할 수 없다.
 * 따라서 모든 경계값을 "오늘"로부터 역산해 만든다. 그렇게 해야 해가 바뀌어도 테스트가 깨지지 않는다.
 */
class BirthDateTest {

    private static LocalDate birthDateForExactAge(int age) {
        // 오늘이 생일인 사람 → 나이가 정확히 age
        return LocalDate.now().minusYears(age);
    }

    @Test
    @DisplayName("15세는 허용된다 — 하한 경계")
    void acceptsLowerBound() {
        LocalDate value = birthDateForExactAge(15);

        assertThat(new BirthDate(value).getValue()).isEqualTo(value);
    }

    @Test
    @DisplayName("30세는 허용된다 — 상한 경계")
    void acceptsUpperBound() {
        LocalDate value = birthDateForExactAge(30);

        assertThat(new BirthDate(value).getValue()).isEqualTo(value);
    }

    @Test
    @DisplayName("범위 안의 일반적인 나이는 허용된다")
    void acceptsMiddleOfRange() {
        LocalDate value = birthDateForExactAge(17);

        assertThat(new BirthDate(value).getValue()).isEqualTo(value);
    }

    @Test
    @DisplayName("15세 생일 하루 전(=14세)은 INVALID_BIRTHDATE")
    void rejectsOneDayBelowLowerBound() {
        // 15번째 생일이 내일인 사람은 아직 14세다.
        LocalDate value = birthDateForExactAge(15).plusDays(1);

        assertThatThrownBy(() -> new BirthDate(value))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_BIRTHDATE));
    }

    @Test
    @DisplayName("31세는 INVALID_BIRTHDATE — 상한 경계 바로 밖")
    void rejectsAboveUpperBound() {
        LocalDate value = birthDateForExactAge(31);

        assertThatThrownBy(() -> new BirthDate(value))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_BIRTHDATE));
    }

    @Test
    @DisplayName("null은 INVALID_BIRTHDATE")
    void rejectsNull() {
        assertThatThrownBy(() -> new BirthDate(null))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_BIRTHDATE));
    }

    @Test
    @DisplayName("미래 날짜는 INVALID_BIRTHDATE — 나이가 음수로 계산된다")
    void rejectsFutureDate() {
        LocalDate value = LocalDate.now().plusYears(1);

        assertThatThrownBy(() -> new BirthDate(value))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_BIRTHDATE));
    }

    @Test
    @DisplayName("오늘 태어난 경우도 INVALID_BIRTHDATE")
    void rejectsToday() {
        assertThatThrownBy(() -> new BirthDate(LocalDate.now()))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_BIRTHDATE));
    }

    @Test
    @DisplayName("같은 값이면 동등하다")
    void equalsByValue() {
        LocalDate value = birthDateForExactAge(17);

        assertThat(new BirthDate(value))
                .isEqualTo(new BirthDate(value))
                .hasSameHashCodeAs(new BirthDate(value));
    }
}
