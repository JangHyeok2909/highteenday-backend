package com.example.highteenday_backend.dtos.Login;

import com.example.highteenday_backend.enums.Provider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.core.AuthenticationException;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OAuth2UserInfoTest {

    @Nested
    @DisplayName("google")
    class Google {

        @Test
        @DisplayName("최상위 name/email을 그대로 읽는다")
        void readsFlatAttributes() {
            Map<String, Object> attributes = Map.of(
                    "name", "김철수",
                    "email", "chulsoo@gmail.com",
                    "picture", "https://img/p.png");

            OAuth2UserInfo info = OAuth2UserInfo.of("google", attributes);

            assertThat(info.name()).isEqualTo("김철수");
            assertThat(info.email()).isEqualTo("chulsoo@gmail.com");
            assertThat(info.provider()).isEqualTo(Provider.GOOGLE);
        }

        @Test
        @DisplayName("email이 없으면 null로 담긴다 — 이후 Email 검증에서 걸린다")
        void allowsMissingEmail() {
            OAuth2UserInfo info = OAuth2UserInfo.of("google", Map.of("name", "김철수"));

            assertThat(info.email()).isNull();
        }
    }

    @Nested
    @DisplayName("kakao")
    class Kakao {

        private Map<String, Object> kakaoAttributes(String nickname, String email) {
            Map<String, Object> profile = new HashMap<>();
            profile.put("nickname", nickname);
            Map<String, Object> account = new HashMap<>();
            account.put("profile", profile);
            account.put("email", email);
            return Map.of("kakao_account", account);
        }

        @Test
        @DisplayName("kakao_account.profile.nickname과 kakao_account.email을 읽는다")
        void readsNestedAttributes() {
            OAuth2UserInfo info = OAuth2UserInfo.of("kakao",
                    kakaoAttributes("철수", "chulsoo@kakao.com"));

            assertThat(info.name()).isEqualTo("철수");
            assertThat(info.email()).isEqualTo("chulsoo@kakao.com");
            assertThat(info.provider()).isEqualTo(Provider.KAKAO);
        }

        @Test
        @DisplayName("이메일 제공 동의가 없으면 email이 null이다")
        void allowsMissingEmail() {
            OAuth2UserInfo info = OAuth2UserInfo.of("kakao", kakaoAttributes("철수", null));

            assertThat(info.email()).isNull();
        }

        @Test
        @DisplayName("kakao_account 자체가 없으면 NPE가 새어 나간다 — 무검증 캐스팅")
        void throwsNpeWhenAccountMissing() {
            // account.get("profile") 앞에 null 검사가 없어 로그인 전체가 500으로 떨어진다.
            // 현재 동작을 고정해 둔다.
            assertThatThrownBy(() -> OAuth2UserInfo.of("kakao", Map.of("id", 12345L)))
                    .isInstanceOf(NullPointerException.class);
        }

        @Test
        @DisplayName("profile이 없으면 NPE가 새어 나간다")
        void throwsNpeWhenProfileMissing() {
            Map<String, Object> account = new HashMap<>();
            account.put("email", "chulsoo@kakao.com");

            assertThatThrownBy(() -> OAuth2UserInfo.of("kakao", Map.of("kakao_account", account)))
                    .isInstanceOf(NullPointerException.class);
        }
    }

    @Nested
    @DisplayName("naver")
    class Naver {

        @Test
        @DisplayName("response 하위의 name/email을 읽는다")
        void readsNestedResponse() {
            Map<String, Object> response = new HashMap<>();
            response.put("name", "김철수");
            response.put("email", "chulsoo@naver.com");

            OAuth2UserInfo info = OAuth2UserInfo.of("naver", Map.of("response", response));

            assertThat(info.name()).isEqualTo("김철수");
            assertThat(info.email()).isEqualTo("chulsoo@naver.com");
            assertThat(info.provider()).isEqualTo(Provider.NAVER);
        }

        @Test
        @DisplayName("response가 없으면 NPE가 새어 나간다")
        void throwsNpeWhenResponseMissing() {
            assertThatThrownBy(() -> OAuth2UserInfo.of("naver", Map.of()))
                    .isInstanceOf(NullPointerException.class);
        }
    }

    @Nested
    @DisplayName("지원하지 않는 provider")
    class UnsupportedProvider {

        @ParameterizedTest
        @ValueSource(strings = {"facebook", "apple", "GOOGLE", "", "kakao_account"})
        @DisplayName("등록되지 않은 registrationId는 AuthenticationException")
        void throwsOnUnknownProvider(String registrationId) {
            // 대문자 GOOGLE도 실패한다 — switch가 소문자 리터럴만 받는다.
            assertThatThrownBy(() -> OAuth2UserInfo.of(registrationId, Map.of()))
                    .isInstanceOf(AuthenticationException.class)
                    .hasMessageContaining("지원하지 않는");
        }
    }
}
