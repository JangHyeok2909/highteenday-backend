package com.example.highteenday_backend.security;

import com.example.highteenday_backend.domain.Token.Token;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.TokenPair;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.services.domain.TokenService;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("TokenProvider")
class TokenProviderTest {

    // HS512 는 최소 512 bit(64 byte) 키가 필요
    private static final String TEST_KEY =
            "test-secret-key-for-junit-tests-that-is-at-least-64-bytes-long-ok";

    @Mock private TokenService tokenService;
    @Mock private UserRepository userRepository;

    @InjectMocks
    private TokenProvider tokenProvider;

    private User user;
    private Authentication authentication;
    private SecretKey secretKey;

    @BeforeEach
    void setUp() {
        user = User.builder()
                .id(1L)
                .email(new Email("test@test.com"))
                .name(new UserName("홍길동"))
                .nickname(new Nickname("테스터"))
                .provider(Provider.DEFAULT)
                .role(Role.USER)
                .build();

        // @Value + @PostConstruct 를 수동으로 초기화
        ReflectionTestUtils.setField(tokenProvider, "key", TEST_KEY);
        ReflectionTestUtils.invokeMethod(tokenProvider, "setSecretKey");
        secretKey = Keys.hmacShaKeyFor(TEST_KEY.getBytes());

        CustomUserPrincipal principal = new CustomUserPrincipal(user);
        authentication = new UsernamePasswordAuthenticationToken(
                principal, null, principal.getAuthorities());

        when(userRepository.findByEmail("test@test.com")).thenReturn(Optional.of(user));
    }

    // ──────────────────────────────────────────────
    // reissueTokens — 핵심 플로우
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("reissueTokens")
    class ReissueTokens {

        @Test
        @DisplayName("유효한 refresh token → 새 accessToken · refreshToken 을 담은 TokenPair 반환")
        void returnsNewTokenPairForValidRefreshToken() {
            // 유효한 refresh token 발급 (내부적으로 tokenService.saveOrUpdate 호출)
            String validRefreshToken = tokenProvider.generateRefreshToken(authentication,
                    tokenProvider.generateAccessToken(authentication));

            // DB/Redis 에 저장된 토큰이라고 가정
            Token storedToken = Token.builder().refreshToken(validRefreshToken).user(user).build();
            when(tokenService.findByRefreshTokenOrThrow(validRefreshToken)).thenReturn(storedToken);

            TokenPair result = tokenProvider.reissueTokens(validRefreshToken);

            assertThat(result.accessToken()).isNotNull();
            assertThat(result.refreshToken()).isNotNull();
            // rotation 으로 새 토큰이 발급되므로 기존 refresh token 과 달라야 함
            assertThat(result.refreshToken()).isNotEqualTo(validRefreshToken);
        }

        @Test
        @DisplayName("재발급 시 tokenService.saveOrUpdate() 가 호출되어 rotation 이 저장된다")
        void savesNewTokensOnReissue() {
            String validRefreshToken = tokenProvider.generateRefreshToken(authentication,
                    tokenProvider.generateAccessToken(authentication));
            Token storedToken = Token.builder().refreshToken(validRefreshToken).user(user).build();
            when(tokenService.findByRefreshTokenOrThrow(validRefreshToken)).thenReturn(storedToken);

            tokenProvider.reissueTokens(validRefreshToken);

            // generateRefreshToken → saveOrUpdate 가 최소 2번(발급+rotation) 호출됨
            verify(tokenService).findByRefreshTokenOrThrow(validRefreshToken);
        }

        @Test
        @DisplayName("refresh token 이 DB/Redis 에 없으면 예외를 그대로 전파한다")
        void propagatesExceptionWhenTokenNotStored() {
            String validRefreshToken = tokenProvider.generateRefreshToken(authentication,
                    tokenProvider.generateAccessToken(authentication));
            when(tokenService.findByRefreshTokenOrThrow(anyString()))
                    .thenThrow(new RuntimeException("리프레시 토큰이 유효하지 않습니다."));

            assertThatThrownBy(() -> tokenProvider.reissueTokens(validRefreshToken))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("리프레시 토큰이 유효하지 않습니다");
        }

        @Test
        @DisplayName("만료된 refresh token → TOKEN_EXPIRED 예외")
        void throwsTokenExpiredForExpiredToken() {
            String expiredToken = Jwts.builder()
                    .setSubject(user.getEmailValue())
                    .claim("role", "USER")
                    .claim("name", user.getNameValue())
                    .claim("provider", user.getProvider().name())
                    .setIssuedAt(new Date(System.currentTimeMillis() - 10_000))
                    .setExpiration(new Date(System.currentTimeMillis() - 1))
                    .signWith(secretKey, SignatureAlgorithm.HS512)
                    .compact();

            assertThatThrownBy(() -> tokenProvider.reissueTokens(expiredToken))
                    .isInstanceOf(TokenException.class)
                    .satisfies(ex -> assertThat(((TokenException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.TOKEN_EXPIRED));
        }

        @Test
        @DisplayName("위변조된 refresh token → INVALID_JWT_SIGNATURE 예외")
        void throwsInvalidSignatureForForgery() {
            SecretKey wrongKey = Keys.hmacShaKeyFor(
                    "wrong-secret-key-that-is-definitely-64-bytes-long-for-hs512-ok!!".getBytes());
            String forgedToken = Jwts.builder()
                    .setSubject(user.getEmailValue())
                    .claim("role", "USER")
                    .claim("name", user.getNameValue())
                    .claim("provider", user.getProvider().name())
                    .setIssuedAt(new Date())
                    .setExpiration(new Date(System.currentTimeMillis() + 60_000))
                    .signWith(wrongKey, SignatureAlgorithm.HS512)
                    .compact();

            assertThatThrownBy(() -> tokenProvider.reissueTokens(forgedToken))
                    .isInstanceOf(TokenException.class)
                    .satisfies(ex -> assertThat(((TokenException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_JWT_SIGNATURE));
        }

        @Test
        @DisplayName("완전히 잘못된 문자열 → INVALID_TOKEN 예외")
        void throwsInvalidTokenForGarbage() {
            assertThatThrownBy(() -> tokenProvider.reissueTokens("not.a.jwt"))
                    .isInstanceOf(TokenException.class)
                    .satisfies(ex -> assertThat(((TokenException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.INVALID_TOKEN));
        }
    }
}
