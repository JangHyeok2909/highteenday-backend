package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.RequestEntity;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.AuthenticationMethod;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.web.client.RestOperations;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * loadUser 는 부모 DefaultOAuth2UserService 를 통해 provider에 HTTP 호출을 한다.
 * setRestOperations 로 그 호출만 갈아끼우고, 실제 서비스 코드 경로를 그대로 태운다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CustomOAuth2UserServiceTest {

    @Mock private UserService userService;
    @Mock private RestOperations restOperations;

    private CustomOAuth2UserService service;

    @BeforeEach
    void setUp() {
        service = new CustomOAuth2UserService(userService);
        service.setRestOperations(restOperations);
    }

    /** provider의 userinfo 응답을 고정한다. */
    @SuppressWarnings("unchecked")
    private void stubUserInfoResponse(Map<String, Object> attributes) {
        when(restOperations.exchange(any(RequestEntity.class), any(ParameterizedTypeReference.class)))
                .thenReturn(new ResponseEntity<>(attributes, HttpStatus.OK));
    }

    private static OAuth2UserRequest requestFor(String registrationId, String userNameAttribute) {
        ClientRegistration registration = ClientRegistration
                .withRegistrationId(registrationId)
                .clientId("client-id")
                .clientSecret("client-secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("http://localhost/login/oauth2/code/" + registrationId)
                .authorizationUri("https://provider/authorize")
                .tokenUri("https://provider/token")
                .userInfoUri("https://provider/userinfo")
                .userInfoAuthenticationMethod(AuthenticationMethod.HEADER)
                .userNameAttributeName(userNameAttribute)
                .build();
        OAuth2AccessToken accessToken = new OAuth2AccessToken(
                OAuth2AccessToken.TokenType.BEARER, "token-value",
                Instant.now(), Instant.now().plusSeconds(3600), Set.of("profile"));
        return new OAuth2UserRequest(registration, accessToken);
    }

    private static Map<String, Object> googleAttributes(String email, String name, String picture) {
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("sub", "google-sub-1");
        attributes.put("email", email);
        attributes.put("name", name);
        if (picture != null) attributes.put("picture", picture);
        return attributes;
    }

    private static Map<String, Object> kakaoAttributes(String email, String nickname) {
        Map<String, Object> profile = new HashMap<>();
        profile.put("nickname", nickname);
        Map<String, Object> account = new HashMap<>();
        account.put("profile", profile);
        account.put("email", email);
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("id", 12345L);
        attributes.put("kakao_account", account);
        return attributes;
    }

    private static User userNamed(String email, String nickname) {
        return User.builder()
                .id(1L)
                .email(new Email(email))
                .name(new UserName("김철수"))
                .nickname(new Nickname(nickname))
                .provider(Provider.GOOGLE)
                .role(Role.USER)
                .build();
    }

    @Nested
    @DisplayName("기존 사용자")
    class ExistingUser {

        @Test
        @DisplayName("이미 가입돼 있으면 조회만 하고 자동 가입하지 않는다")
        void looksUpWithoutRegistering() {
            stubUserInfoResponse(googleAttributes("chulsoo@gmail.com", "김철수", null));
            when(userService.existsByEmail("chulsoo@gmail.com")).thenReturn(true);
            when(userService.findByEmail("chulsoo@gmail.com"))
                    .thenReturn(userNamed("chulsoo@gmail.com", "chulsoo"));

            CustomUserPrincipal principal = service.loadUser(requestFor("google", "sub"));

            assertThat(principal.isNewUser()).isFalse();
            assertThat(principal.getUser().getEmailValue()).isEqualTo("chulsoo@gmail.com");
            verify(userService).findByEmail("chulsoo@gmail.com");
            verify(userService, never()).registerOAuthUser(anyString(), anyString(), any(), any());
        }

        @Test
        @DisplayName("principal에 provider 속성이 함께 담긴다")
        void carriesProviderAttributes() {
            stubUserInfoResponse(googleAttributes("chulsoo@gmail.com", "김철수", "https://img/p.png"));
            when(userService.existsByEmail("chulsoo@gmail.com")).thenReturn(true);
            when(userService.findByEmail(anyString()))
                    .thenReturn(userNamed("chulsoo@gmail.com", "chulsoo"));

            CustomUserPrincipal principal = service.loadUser(requestFor("google", "sub"));

            assertThat(principal.getAttributes())
                    .containsEntry("email", "chulsoo@gmail.com")
                    .containsEntry("picture", "https://img/p.png");
        }
    }

    @Nested
    @DisplayName("신규 사용자")
    class NewUser {

        @Test
        @DisplayName("가입되지 않았으면 자동 가입하고 isNewUser=true로 표시한다")
        void autoRegisters() {
            stubUserInfoResponse(googleAttributes("new@gmail.com", "신규", "https://img/p.png"));
            when(userService.existsByEmail("new@gmail.com")).thenReturn(false);
            when(userService.registerOAuthUser(anyString(), anyString(), any(), any()))
                    .thenReturn(userNamed("new@gmail.com", "new"));

            CustomUserPrincipal principal = service.loadUser(requestFor("google", "sub"));

            assertThat(principal.isNewUser()).isTrue();
            verify(userService).registerOAuthUser(
                    "new@gmail.com", "신규", Provider.GOOGLE, "https://img/p.png");
            verify(userService, never()).findByEmail(anyString());
        }

        @Test
        @DisplayName("picture 속성이 없으면 프로필 URL은 null로 넘어간다")
        void passesNullProfileUrlWhenAbsent() {
            stubUserInfoResponse(googleAttributes("new@gmail.com", "신규", null));
            when(userService.existsByEmail("new@gmail.com")).thenReturn(false);
            when(userService.registerOAuthUser(anyString(), anyString(), any(), any()))
                    .thenReturn(userNamed("new@gmail.com", "new"));

            service.loadUser(requestFor("google", "sub"));

            verify(userService).registerOAuthUser("new@gmail.com", "신규", Provider.GOOGLE, null);
        }

        @Test
        @DisplayName("registrationId가 Provider로 변환된다 — kakao → KAKAO")
        void mapsKakaoRegistrationIdToProvider() {
            stubUserInfoResponse(kakaoAttributes("new@kakao.com", "신규"));
            when(userService.existsByEmail("new@kakao.com")).thenReturn(false);
            when(userService.registerOAuthUser(anyString(), anyString(), any(), any()))
                    .thenReturn(userNamed("new@kakao.com", "new"));

            service.loadUser(requestFor("kakao", "id"));

            // 카카오는 최상위에 picture가 없으므로 프로필 URL은 null이 된다
            verify(userService).registerOAuthUser("new@kakao.com", "신규", Provider.KAKAO, null);
        }
    }

    @Nested
    @DisplayName("속성 이상")
    class MalformedAttributes {

        @Test
        @DisplayName("kakao_account가 없으면 NPE로 로그인이 실패한다 — 무검증 캐스팅")
        void throwsWhenKakaoAccountMissing() {
            Map<String, Object> attributes = new HashMap<>();
            attributes.put("id", 12345L);
            stubUserInfoResponse(attributes);

            assertThatThrownBy(() -> service.loadUser(requestFor("kakao", "id")))
                    .isInstanceOf(NullPointerException.class);

            verify(userService, never()).registerOAuthUser(anyString(), anyString(), any(), any());
        }

        @Test
        @DisplayName("이메일 동의가 없으면 email이 null이라 존재 확인이 null로 넘어간다")
        void passesNullEmailToExistenceCheck() {
            // 카카오에서 이메일 제공 동의를 받지 못한 경우다. 여기서 막지 않으면
            // 뒤의 new Email(null) 에서 INVALID_EMAIL_FORMAT 으로 떨어진다.
            stubUserInfoResponse(kakaoAttributes(null, "신규"));
            when(userService.existsByEmail(null)).thenReturn(false);
            when(userService.registerOAuthUser(any(), anyString(), any(), any()))
                    .thenThrow(new com.example.highteenday_backend.exceptions.CustomException(
                            com.example.highteenday_backend.enums.ErrorCode.INVALID_EMAIL_FORMAT));

            assertThatThrownBy(() -> service.loadUser(requestFor("kakao", "id")))
                    .isInstanceOf(com.example.highteenday_backend.exceptions.CustomException.class);

            verify(userService).existsByEmail(null);
        }

        @Test
        @DisplayName("지원하지 않는 provider면 AuthenticationException")
        void throwsOnUnsupportedProvider() {
            stubUserInfoResponse(googleAttributes("new@gmail.com", "신규", null));

            assertThatThrownBy(() -> service.loadUser(requestFor("facebook", "email")))
                    .isInstanceOf(org.springframework.security.core.AuthenticationException.class);
        }
    }
}
