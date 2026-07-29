package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.Token.Token;
import com.example.highteenday_backend.domain.Token.TokenRepository;
import com.example.highteenday_backend.domain.port.TokenCachePort;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class TokenService {

    private static final Duration REFRESH_TTL = Duration.ofDays(7);
    private final TokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final TokenCachePort tokenCache;

    @Transactional
    public void deleteByUserEmail(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("사용자 없음 - TokenService.java"));
        tokenRepository.findByUser(user).ifPresent(token -> {
            tokenCache.delete(token.getRefreshToken());
            tokenRepository.delete(token);
        });
    }

    @Transactional
    public void saveOrUpdate(String userKey, String refreshToken, String accessToken){
        User user = userRepository.findByEmail(userKey)
                .orElseThrow(() -> new RuntimeException("사용자 없음 - TokenService.java"));

        LocalDateTime expiresAt = LocalDateTime.now().plusDays(7);
        Optional<Token> optToken = tokenRepository.findByUser(user);

        Token token = optToken
                .map(t -> {
                    // rotation 시 기존 Redis 키 삭제
                    tokenCache.delete(t.getRefreshToken());
                    t.updateAccessToken(accessToken);
                    t.updateRefreshToken(refreshToken, expiresAt);
                    return t;
                })
                .orElseGet(() -> new Token(null, user, refreshToken, accessToken, expiresAt));

        tokenRepository.save(token);
        tokenCache.put(refreshToken, userKey, REFRESH_TTL);
    }

    public Token findByAccessTokenOrThrow(String accessToken){
        return tokenRepository.findByAccessToken(accessToken)
                .orElseThrow(() -> new RuntimeException("토큰이 유효하지 않습니다."));
    }

    public Token findByRefreshTokenOrThrow(String refreshToken){
        // 1. Redis 조회 (cache hit) — 장애 시 Optional.empty() 반환
        Optional<String> cachedEmail = tokenCache.get(refreshToken);

        if (cachedEmail.isPresent()) {
            User user = userRepository.findByEmail(cachedEmail.get())
                    .orElseThrow(() -> new RuntimeException("리프레시 토큰이 유효하지 않습니다."));
            return tokenRepository.findByUser(user)
                    .orElseThrow(() -> new RuntimeException("리프레시 토큰이 유효하지 않습니다."));
        }

        // 2. Redis miss → DB 조회
        Token token = tokenRepository.findByRefreshToken(refreshToken)
                .orElseThrow(() -> new RuntimeException("리프레시 토큰이 유효하지 않습니다."));

        // 만료된 토큰이면 DB에서 삭제 후 예외
        if (token.getExpiresAt() != null && token.getExpiresAt().isBefore(LocalDateTime.now())) {
            tokenRepository.delete(token);
            throw new RuntimeException("리프레시 토큰이 만료되었습니다.");
        }

        // Redis 재적재 (남은 TTL 계산)
        Duration remaining = token.getExpiresAt() != null
                ? Duration.between(LocalDateTime.now(), token.getExpiresAt())
                : REFRESH_TTL;
        tokenCache.put(refreshToken, token.getUser().getEmailValue(), remaining);

        return token;
    }

    @Transactional
    public void updateToken(String accessToken, Token token){
        token.updateAccessToken(accessToken);
        tokenRepository.save(token);
    }
}
