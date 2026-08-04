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

class UserNameTest {

    @ParameterizedTest(name = "{0}자")
    @ValueSource(ints = {2, 3, 7, 8})
    @DisplayName("2~8자는 허용된다")
    void acceptsLengthWithinRange(int length) {
        String raw = "가".repeat(length);
        assertThat(new UserName(raw).getValue()).isEqualTo(raw);
    }

    @ParameterizedTest(name = "{0}자")
    @ValueSource(ints = {0, 1, 9, 10, 11})
    @DisplayName("2자 미만 또는 8자 초과는 INVALID_NAME_FORMAT")
    void rejectsLengthOutOfRange(int length) {
        String raw = "가".repeat(length);
        assertThatThrownBy(() -> new UserName(raw))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_NAME_FORMAT));
    }

    @ParameterizedTest
    @NullSource
    @DisplayName("null은 INVALID_NAME_FORMAT")
    void rejectsNull(String raw) {
        assertThatThrownBy(() -> new UserName(raw))
                .isInstanceOf(CustomException.class)
                .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_NAME_FORMAT));
    }

    @Test
    @DisplayName("검증 상한(8자)이 DB 컬럼 길이(10자)보다 좁다")
    void validationUpperBoundIsNarrowerThanColumn() {
        // UserService.registerOAuthUser 는 이름을 10자로 자른 뒤 이 VO에 넣는데,
        // 이 VO는 8자까지만 받는다. 두 상한이 어긋나 있다는 사실을 고정해 둔다.
        // UserServiceTest 의 OAuthRegistration 케이스와 함께 봐야 한다.
        assertThatThrownBy(() -> new UserName("가".repeat(9)))
                .isInstanceOf(CustomException.class);
        assertThatThrownBy(() -> new UserName("가".repeat(10)))
                .isInstanceOf(CustomException.class);
    }

    @Test
    @DisplayName("같은 값이면 동등하다")
    void equalsByValue() {
        assertThat(new UserName("홍길동"))
                .isEqualTo(new UserName("홍길동"))
                .hasSameHashCodeAs(new UserName("홍길동"));
    }
}
