package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.Token.Token;
import com.example.highteenday_backend.domain.Token.TokenRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("TokenService")
class TokenServiceTest {

    @Mock
    private TokenRepository tokenRepository;
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private TokenService tokenService;

    private final User user = User.builder().id(1L).email("u@test.com").build();

    @Nested
    @DisplayName("saveOrUpdate")
    class SaveOrUpdate {

        @Test
        @DisplayName("기존 토큰이 있으면 액세스·리프레시만 갱신하고 저장한다")
        void updatesExistingToken() {
            when(userRepository.findByEmail("u@test.com")).thenReturn(Optional.of(user));
            Token existing = Token.builder()
                    .id(10L)
                    .user(user)
                    .refreshToken("old-refresh")
                    .accessToken("old-access")
                    .build();
            when(tokenRepository.findByUser(user)).thenReturn(Optional.of(existing));

            tokenService.saveOrUpdate("u@test.com", "new-refresh", "new-access");

            assertThat(existing.getRefreshToken()).isEqualTo("new-refresh");
            assertThat(existing.getAccessToken()).isEqualTo("new-access");
            verify(tokenRepository).save(existing);
        }

        @Test
        @DisplayName("토큰이 없으면 새 엔티티를 만들어 저장한다")
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
        }

        @Test
        @DisplayName("이메일에 해당하는 유저가 없으면 예외")
        void throwsWhenUserMissing() {
            when(userRepository.findByEmail("x@test.com")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.saveOrUpdate("x@test.com", "r", "a"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("사용자 없음");
        }
    }

    @Nested
    @DisplayName("findByAccessTokenOrThrow")
    class FindByAccess {

        @Test
        @DisplayName("토큰이 있으면 반환한다")
        void returnsWhenFound() {
            Token token = Token.builder().accessToken("acc").build();
            when(tokenRepository.findByAccessToken("acc")).thenReturn(Optional.of(token));

            assertThat(tokenService.findByAccessTokenOrThrow("acc")).isSameAs(token);
        }

        @Test
        @DisplayName("없으면 RuntimeException")
        void throwsWhenMissing() {
            when(tokenRepository.findByAccessToken("bad")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> tokenService.findByAccessTokenOrThrow("bad"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("토큰이 유효하지 않습니다");
        }
    }

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
