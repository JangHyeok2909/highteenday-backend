package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.Token.Token;
import com.example.highteenday_backend.domain.Token.TokenRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.redis.RedisConnectionFailureException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("TokenService")
class TokenServiceTest {

    @Mock private TokenRepository tokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private StringRedisTemplate tokenRedisTemplate;
    @Mock private ValueOperations<String, String> valueOps;

    @InjectMocks
    private TokenService tokenService;

    private final User user = User.builder().id(1L).email("u@test.com").build();

    @BeforeEach
    void setUp() {
        when(tokenRedisTemplate.opsForValue()).thenReturn(valueOps);
    }

    // ──────────────────────────────────────────────
    // saveOrUpdate
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("saveOrUpdate")
    class SaveOrUpdate {

        @Test
        @DisplayName("기존 토큰이 있으면 Redis 구키 삭제 후 DB·Redis 모두 갱신한다")
        void updatesExistingToken() {
            Token existing = Token.builder()
                    .id(10L).user(user)
                    .refreshToken("old-refresh").accessToken("old-access")
                    .expiresAt(LocalDateTime.now().plusDays(3))
                    .build();
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.of(existing));

            tokenService.saveOrUpdate("u@test.com", "new-refresh", "new-access");

            // 기존 Redis 키 삭제 (rotation)
            verify(tokenRedisTemplate).delete("RT:old-refresh");
            // DB 갱신
            assertThat(existing.getRefreshToken()).isEqualTo("new-refresh");
            assertThat(existing.getAccessToken()).isEqualTo("new-access");
            assertThat(existing.getExpiresAt()).isAfter(LocalDateTime.now());
            verify(tokenRepository).save(existing);
            // Redis 신규 키 저장
            verify(valueOps).set(eq("RT:new-refresh"), eq("u@test.com"), eq(Duration.ofDays(7)));
        }

        @Test
        @DisplayName("토큰이 없으면 새 엔티티를 만들어 DB·Redis에 저장한다")
        void createsNewTokenWhenAbsent() {
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.empty());

            tokenService.saveOrUpdate("u@test.com", "r1", "a1");

            ArgumentCaptor<Token> captor = ArgumentCaptor.forClass(Token.class);
            verify(tokenRepository).save(captor.capture());
            Token saved = captor.getValue();
            assertThat(saved.getUser()).isEqualTo(user);
            assertThat(saved.getRefreshToken()).isEqualTo("r1");
            assertThat(saved.getAccessToken()).isEqualTo("a1");
            assertThat(saved.getExpiresAt()).isAfter(LocalDateTime.now());
            verify(valueOps).set(eq("RT:r1"), eq("u@test.com"), eq(Duration.ofDays(7)));
        }

        @Test
        @DisplayName("이메일에 해당하는 유저가 없으면 예외를 던진다")
        void throwsWhenUserMissing() {
            when(userRepository.findByEmail("x@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.saveOrUpdate("x@test.com", "r", "a"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("사용자 없음");
        }

        @Test
        @DisplayName("기존 키 Redis delete 장애 시에도 DB 저장은 수행된다")
        void dbSaveSucceedsWhenRedisDeleteFails() {
            Token existing = Token.builder()
                    .id(10L).user(user)
                    .refreshToken("old-rf").accessToken("old-ac")
                    .expiresAt(LocalDateTime.now().plusDays(3))
                    .build();
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.of(existing));
            when(tokenRedisTemplate.delete(anyString()))
                    .thenThrow(new RedisConnectionFailureException("down"));

            assertThatCode(() -> tokenService.saveOrUpdate("u@test.com", "new-rf", "new-ac"))
                    .doesNotThrowAnyException();
            verify(tokenRepository).save(existing);
        }

        @Test
        @DisplayName("신규 키 Redis set 장애 시에도 DB 저장은 수행된다")
        void dbSaveSucceedsWhenRedisSetFails() {
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.empty());
            org.mockito.Mockito.doThrow(new RedisConnectionFailureException("down"))
                    .when(valueOps).set(anyString(), anyString(), any(Duration.class));

            assertThatCode(() -> tokenService.saveOrUpdate("u@test.com", "rf", "ac"))
                    .doesNotThrowAnyException();
            verify(tokenRepository).save(any(Token.class));
        }
    }

    // ──────────────────────────────────────────────
    // deleteByUserEmail
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("deleteByUserEmail")
    class DeleteByUserEmail {

        @Test
        @DisplayName("토큰이 존재하면 Redis 키와 DB 레코드를 모두 삭제한다")
        void deletesRedisAndDb() {
            Token token = Token.builder()
                    .user(user).refreshToken("rf-token").accessToken("ac-token")
                    .build();
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.of(token));

            tokenService.deleteByUserEmail("u@test.com");

            verify(tokenRedisTemplate).delete("RT:rf-token");
            verify(tokenRepository).delete(token);
        }

        @Test
        @DisplayName("토큰이 없으면 Redis·DB 삭제 없이 정상 종료한다")
        void doesNothingWhenTokenAbsent() {
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.empty());

            tokenService.deleteByUserEmail("u@test.com");

            verify(tokenRedisTemplate, never()).delete(anyString());
            verify(tokenRepository, never()).delete(any(Token.class));
        }

        @Test
        @DisplayName("유저가 없으면 예외를 던진다")
        void throwsWhenUserMissing() {
            when(userRepository.findByEmail("x@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.deleteByUserEmail("x@test.com"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("사용자 없음");
        }

        @Test
        @DisplayName("Redis delete 장애 시에도 DB 삭제는 수행된다")
        void dbDeleteSucceedsWhenRedisDown() {
            Token token = Token.builder()
                    .user(user).refreshToken("rf").accessToken("ac").build();
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.of(token));
            when(tokenRedisTemplate.delete(anyString()))
                    .thenThrow(new RedisConnectionFailureException("down"));

            assertThatCode(() -> tokenService.deleteByUserEmail("u@test.com"))
                    .doesNotThrowAnyException();
            verify(tokenRepository).delete(token);
        }
    }

    // ──────────────────────────────────────────────
    // findByRefreshTokenOrThrow
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("findByRefreshTokenOrThrow")
    class FindByRefreshToken {

        @Test
        @DisplayName("Redis HIT — DB 조회 없이 Token을 반환한다")
        void returnsTokenOnRedisHit() {
            Token token = Token.builder().user(user).refreshToken("rt1").build();
            when(valueOps.get("RT:rt1")).thenReturn("u@test.com");
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.of(token));

            Token result = tokenService.findByRefreshTokenOrThrow("rt1");

            assertThat(result).isSameAs(token);
            verify(tokenRepository, never()).findByRefreshToken(anyString());
        }

        @Test
        @DisplayName("Redis MISS + DB 유효 — Redis에 재적재하고 Token을 반환한다")
        void repopulatesRedisOnCacheMiss() {
            LocalDateTime future = LocalDateTime.now().plusDays(3);
            Token token = Token.builder().user(user).refreshToken("rt2").expiresAt(future).build();
            when(valueOps.get("RT:rt2")).thenReturn(null);
            when(tokenRepository.findByRefreshToken("rt2")).thenReturn(Optional.of(token));

            Token result = tokenService.findByRefreshTokenOrThrow("rt2");

            assertThat(result).isSameAs(token);
            // 남은 TTL로 Redis 재적재
            verify(valueOps).set(eq("RT:rt2"), eq("u@test.com"), any(Duration.class));
        }

        @Test
        @DisplayName("Redis MISS + DB 만료 — DB에서 삭제 후 예외를 던진다")
        void deletesExpiredTokenAndThrows() {
            LocalDateTime past = LocalDateTime.now().minusSeconds(1);
            Token token = Token.builder().user(user).refreshToken("rt3").expiresAt(past).build();
            when(valueOps.get("RT:rt3")).thenReturn(null);
            when(tokenRepository.findByRefreshToken("rt3")).thenReturn(Optional.of(token));

            assertThatThrownBy(() -> tokenService.findByRefreshTokenOrThrow("rt3"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("만료");

            verify(tokenRepository).delete(token);
            verify(valueOps, never()).set(anyString(), anyString(), any(Duration.class));
        }

        @Test
        @DisplayName("Redis MISS + DB 없음 — 예외를 던진다")
        void throwsWhenNotInDbEither() {
            when(valueOps.get("RT:bad")).thenReturn(null);
            when(tokenRepository.findByRefreshToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.findByRefreshTokenOrThrow("bad"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("리프레시 토큰이 유효하지 않습니다");
        }

        @Test
        @DisplayName("Redis HIT이지만 DB에 토큰이 없으면 예외를 던진다")
        void throwsWhenRedisHitButTokenGoneFromDb() {
            when(valueOps.get("RT:rt4")).thenReturn("u@test.com");
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.findByRefreshTokenOrThrow("rt4"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("리프레시 토큰이 유효하지 않습니다");
        }

        @Test
        @DisplayName("Redis 장애 시 DB로 폴백하여 Token을 반환한다")
        void fallsBackToDbWhenRedisDown() {
            LocalDateTime future = LocalDateTime.now().plusDays(3);
            Token token = Token.builder().user(user).refreshToken("rt5").expiresAt(future).build();
            when(tokenRedisTemplate.opsForValue())
                    .thenThrow(new RedisConnectionFailureException("down"));
            when(tokenRepository.findByRefreshToken("rt5")).thenReturn(Optional.of(token));

            Token result = tokenService.findByRefreshTokenOrThrow("rt5");

            assertThat(result).isSameAs(token);
            verify(tokenRepository).findByRefreshToken("rt5");
        }
    }

    // ──────────────────────────────────────────────
    // findByAccessTokenOrThrow
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("findByAccessTokenOrThrow")
    class FindByAccessToken {

        @Test
        @DisplayName("토큰이 있으면 반환한다")
        void returnsWhenFound() {
            Token token = Token.builder().accessToken("acc").build();
            when(tokenRepository.findByAccessToken("acc")).thenReturn(Optional.of(token));

            assertThat(tokenService.findByAccessTokenOrThrow("acc")).isSameAs(token);
        }

        @Test
        @DisplayName("없으면 RuntimeException을 던진다")
        void throwsWhenMissing() {
            when(tokenRepository.findByAccessToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.findByAccessTokenOrThrow("bad"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("토큰이 유효하지 않습니다");
        }
    }

    // ──────────────────────────────────────────────
    // updateToken
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("updateToken")
    class UpdateToken {

        @Test
        @DisplayName("액세스 토큰만 바꾸고 저장한다")
        void updatesAccessAndSaves() {
            Token token = Token.builder().accessToken("old").refreshToken("r").user(user).build();

            tokenService.updateToken("new-access", token);

            assertThat(token.getAccessToken()).isEqualTo("new-access");
            verify(tokenRepository).save(token);
        }
    }
}
