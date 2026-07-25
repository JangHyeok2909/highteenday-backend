package com.example.highteenday_backend.logging;

import com.example.highteenday_backend.Utils.LogMasker;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class LogMaskerTest {

    @Nested
    @DisplayName("maskEmail")
    class MaskEmail {

        @ParameterizedTest(name = "{0} -> {1}")
        @CsvSource({
                "hong@gmail.com,        ho***@gmail.com",
                "wkdgur752500@gmail.com,wk***@gmail.com",
                "ab@naver.com,          a***@naver.com",
                "a@naver.com,           a***@naver.com",
                "test1@highteenday.org, te***@highteenday.org"
        })
        @DisplayName("로컬 파트 앞 2글자만 남기고 가린다")
        void masksLocalPart(String raw, String expected) {
            assertThat(LogMasker.maskEmail(raw)).isEqualTo(expected);
        }

        @Test
        @DisplayName("마스킹 결과에 원문 로컬 파트가 남지 않는다")
        void doesNotLeakFullLocalPart() {
            assertThat(LogMasker.maskEmail("wkdgur752500@gmail.com"))
                    .doesNotContain("wkdgur752500")
                    .doesNotContain("dgur752500");
        }

        @Test
        @DisplayName("같은 이메일은 항상 같은 값으로 마스킹되어 로그 상관관계를 유지한다")
        void isStable() {
            assertThat(LogMasker.maskEmail("hong@gmail.com"))
                    .isEqualTo(LogMasker.maskEmail("hong@gmail.com"));
        }

        @ParameterizedTest
        @NullAndEmptySource
        @ValueSource(strings = {"   ", "not-an-email", "@nolocal.com"})
        @DisplayName("이메일 형식이 아니면 전부 가린다")
        void redactsMalformedInput(String raw) {
            assertThat(LogMasker.maskEmail(raw)).isEqualTo("***");
        }
    }

    @Nested
    @DisplayName("maskNickname")
    class MaskNickname {

        @Test
        @DisplayName("첫 글자만 남기고 가린다")
        void keepsFirstCharacterOnly() {
            assertThat(LogMasker.maskNickname("김하이틴")).isEqualTo("김***");
            assertThat(LogMasker.maskNickname("a")).isEqualTo("a***");
        }

        @ParameterizedTest
        @NullAndEmptySource
        @ValueSource(strings = {"  "})
        @DisplayName("값이 없으면 전부 가린다")
        void redactsBlank(String raw) {
            assertThat(LogMasker.maskNickname(raw)).isEqualTo("***");
        }
    }
}
