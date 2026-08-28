package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.Token.Token;
import com.example.highteenday_backend.domain.Token.TokenRepository;
import com.example.highteenday_backend.domain.port.TokenCachePort;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
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

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import org.springframework.http.HttpStatus;

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
    @Mock private TokenCachePort tokenCache;

    @InjectMocks
    private TokenService tokenService;

    private final User user = User.builder().id(1L).email(new Email("u@test.com")).build();

    // ──────────────────────────────────────────────
    // saveOrUpdate
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("saveOrUpdate")
    class SaveOrUpdate {

        @Test
        @DisplayName("기존 토큰이 있으면 캐시 구키 삭제 후 DB·캐시 모두 갱신한다")
        void updatesExistingToken() {
            Token existing = Token.builder()
                    .id(10L).user(user)
                    .refreshToken("old-refresh").accessToken("old-access")
                    .expiresAt(LocalDateTime.now().plusDays(3))
                    .build();
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.of(existing));

            tokenService.saveOrUpdate("u@test.com", "new-refresh", "new-access");

            // 기존 캐시 키 삭제 (rotation)
            verify(tokenCache).delete("old-refresh");
            // DB 갱신
            assertThat(existing.getRefreshToken()).isEqualTo("new-refresh");
            assertThat(existing.getAccessToken()).isEqualTo("new-access");
            assertThat(existing.getExpiresAt()).isAfter(LocalDateTime.now());
            verify(tokenRepository).save(existing);
            // 캐시 신규 키 저장
            verify(tokenCache).put(eq("new-refresh"), eq("u@test.com"), eq(Duration.ofDays(7)));
        }

        @Test
        @DisplayName("토큰이 없으면 새 엔티티를 만들어 DB·캐시에 저장한다")
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
            verify(tokenCache).put(eq("r1"), eq("u@test.com"), eq(Duration.ofDays(7)));
        }

        @Test
        @DisplayName("이메일에 해당하는 유저가 없으면 예외를 던진다")
        void throwsWhenUserMissing() {
            when(userRepository.findByEmail("x@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.saveOrUpdate("x@test.com", "r", "a"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("사용자 없음");
        }
    }

    // ──────────────────────────────────────────────
    // deleteByUserEmail
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("deleteByUserEmail")
    class DeleteByUserEmail {

        @Test
        @DisplayName("토큰이 존재하면 캐시 키와 DB 레코드를 모두 삭제한다")
        void deletesRedisAndDb() {
            Token token = Token.builder()
                    .user(user).refreshToken("rf-token").accessToken("ac-token")
                    .build();
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.of(token));

            tokenService.deleteByUserEmail("u@test.com");

            verify(tokenCache).delete("rf-token");
            verify(tokenRepository).delete(token);
        }

        @Test
        @DisplayName("토큰이 없으면 캐시·DB 삭제 없이 정상 종료한다")
        void doesNothingWhenTokenAbsent() {
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.empty());

            tokenService.deleteByUserEmail("u@test.com");

            verify(tokenCache, never()).delete(anyString());
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
    }

    // ──────────────────────────────────────────────
    // findByRefreshTokenOrThrow
    // ──────────────────────────────────────────────
    @Nested
    @DisplayName("findByRefreshTokenOrThrow")
    class FindByRefreshToken {

        @Test
        @DisplayName("캐시 HIT — DB refreshToken 조회 없이 Token을 반환한다")
        void returnsTokenOnCacheHit() {
            Token token = Token.builder().user(user).refreshToken("rt1").build();
            when(tokenCache.get("rt1")).thenReturn(Optional.of("u@test.com"));
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.of(token));

            Token result = tokenService.findByRefreshTokenOrThrow("rt1");

            assertThat(result).isSameAs(token);
            verify(tokenRepository, never()).findByRefreshToken(anyString());
        }

        @Test
        @DisplayName("캐시 MISS + DB 유효 — 캐시에 재적재하고 Token을 반환한다")
        void repopulatesCacheOnMiss() {
            LocalDateTime future = LocalDateTime.now().plusDays(3);
            Token token = Token.builder().user(user).refreshToken("rt2").expiresAt(future).build();
            when(tokenCache.get("rt2")).thenReturn(Optional.empty());
            when(tokenRepository.findByRefreshToken("rt2")).thenReturn(Optional.of(token));

            Token result = tokenService.findByRefreshTokenOrThrow("rt2");

            assertThat(result).isSameAs(token);
            // 남은 TTL로 캐시 재적재
            verify(tokenCache).put(eq("rt2"), eq("u@test.com"), any(Duration.class));
        }

        @Test
        @DisplayName("캐시 MISS + DB 만료 — DB에서 삭제 후 예외를 던진다")
        void deletesExpiredTokenAndThrows() {
            LocalDateTime past = LocalDateTime.now().minusSeconds(1);
            Token token = Token.builder().user(user).refreshToken("rt3").expiresAt(past).build();
            when(tokenCache.get("rt3")).thenReturn(Optional.empty());
            when(tokenRepository.findByRefreshToken("rt3")).thenReturn(Optional.of(token));

            assertThatThrownBy(() -> tokenService.findByRefreshTokenOrThrow("rt3"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("만료");

            verify(tokenRepository).delete(token);
            verify(tokenCache, never()).put(anyString(), anyString(), any(Duration.class));
        }

        @Test
        @DisplayName("캐시 MISS + DB 없음 — 예외를 던진다")
        void throwsWhenNotInDbEither() {
            when(tokenCache.get("bad")).thenReturn(Optional.empty());
            when(tokenRepository.findByRefreshToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.findByRefreshTokenOrThrow("bad"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("리프레시 토큰이 유효하지 않습니다");
        }

        @Test
        @DisplayName("캐시 HIT이지만 DB에 토큰이 없으면 예외를 던진다")
        void throwsWhenCacheHitButTokenGoneFromDb() {
            when(tokenCache.get("rt4")).thenReturn(Optional.of("u@test.com"));
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            when(tokenRepository.findByUser(user)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.findByRefreshTokenOrThrow("rt4"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("리프레시 토큰이 유효하지 않습니다");
        }

        @Test
        @DisplayName("캐시 장애 시(Optional.empty 반환) DB로 폴백하여 Token을 반환한다")
        void fallsBackToDbWhenCacheDown() {
            LocalDateTime future = LocalDateTime.now().plusDays(3);
            Token token = Token.builder().user(user).refreshToken("rt5").expiresAt(future).build();
            when(tokenCache.get("rt5")).thenReturn(Optional.empty());
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

    /**
     * 실패가 어떤 HTTP 상태로 나가는지 고정한다 (docs/KNOWN-ISSUES.md KI-14).
     *
     * raw RuntimeException 으로 되돌아가면 GlobalExceptionHandler 의 500 경로로 떨어져
     * 아래 단언이 전부 깨진다. 상태 코드까지 보는 이유: 예외 타입만 보면
     * "던지긴 하는데 클라이언트는 여전히 500 을 받는" 상태를 못 잡는다.
     */
    @Nested
    @DisplayName("실패의 HTTP 상태 (KI-14)")
    class FailureStatus {

        private CustomException thrownBy(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
            return (CustomException) org.assertj.core.api.Assertions.catchThrowable(call);
        }

        @Test
        @DisplayName("리프레시 토큰 만료는 401 TOKEN_EXPIRED — 500 이 아니다")
        void expiredRefreshTokenIsUnauthorized() {
            LocalDateTime past = LocalDateTime.now().minusSeconds(1);
            Token token = Token.builder().user(user).refreshToken("expired").expiresAt(past).build();
            when(tokenCache.get("expired")).thenReturn(Optional.empty());
            when(tokenRepository.findByRefreshToken("expired")).thenReturn(Optional.of(token));

            CustomException e = thrownBy(() -> tokenService.findByRefreshTokenOrThrow("expired"));

            assertThat(e).isInstanceOf(CustomException.class);
            assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TOKEN_EXPIRED);
            assertThat(e.getErrorCode().getHttpStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        @DisplayName("없는 리프레시 토큰은 401 INVALID_TOKEN")
        void unknownRefreshTokenIsUnauthorized() {
            when(tokenCache.get("nope")).thenReturn(Optional.empty());
            when(tokenRepository.findByRefreshToken("nope")).thenReturn(Optional.empty());

            CustomException e = thrownBy(() -> tokenService.findByRefreshTokenOrThrow("nope"));

            assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_TOKEN);
            assertThat(e.getErrorCode().getHttpStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        @DisplayName("없는 액세스 토큰은 401 INVALID_TOKEN")
        void unknownAccessTokenIsUnauthorized() {
            when(tokenRepository.findByAccessToken("nope")).thenReturn(Optional.empty());

            CustomException e = thrownBy(() -> tokenService.findByAccessTokenOrThrow("nope"));

            assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_TOKEN);
            assertThat(e.getErrorCode().getHttpStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        @Test
        @DisplayName("존재하지 않는 사용자로 토큰 저장 시 404 USER_NOT_FOUND")
        void unknownUserIsNotFound() {
            when(userRepository.findByEmail("ghost@test.com")).thenReturn(Optional.empty());

            CustomException e = thrownBy(() -> tokenService.saveOrUpdate("ghost@test.com", "r", "a"));

            assertThat(e.getErrorCode()).isEqualTo(ErrorCode.USER_NOT_FOUND);
            assertThat(e.getErrorCode().getHttpStatus()).isEqualTo(HttpStatus.NOT_FOUND);
        }
    }
}
