package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.Token.Token;
import com.example.highteenday_backend.domain.Token.TokenRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class TokenService {

    private static final String RT_PREFIX = "RT:";
    private static final Duration REFRESH_TTL = Duration.ofDays(7);
    private final TokenRepository tokenRepository;
    private final UserRepository userRepository;
    private final StringRedisTemplate tokenRedisTemplate;

    @Transactional
    public void deleteByUserEmail(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("사용자 없음 - TokenService.java"));
        tokenRepository.findByUser(user).ifPresent(token -> {
            try {
                tokenRedisTemplate.delete(RT_PREFIX + token.getRefreshToken());
            } catch (Exception e) {
                log.warn("Redis unavailable, could not delete RT key on logout. userId={}", user.getId(), e);
            }
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
                    // rotation 시 기존 Redis 키 삭제 (best-effort)
                    try {
                        tokenRedisTemplate.delete(RT_PREFIX + t.getRefreshToken());
                    } catch (Exception e) {
                        log.warn("Redis unavailable, could not delete old RT key. userId={}", user.getId(), e);
                    }
                    t.updateAccessToken(accessToken);
                    t.updateRefreshToken(refreshToken, expiresAt);
                    return t;
                })
                .orElseGet(() -> new Token(null, user, refreshToken, accessToken, expiresAt));

        tokenRepository.save(token);

        // Redis에 저장 (Key: RT:{token}, Value: email) — best-effort
        try {
            tokenRedisTemplate.opsForValue().set(RT_PREFIX + refreshToken, userKey, REFRESH_TTL);
        } catch (Exception e) {
            log.warn("Redis unavailable, RT not cached. DB fallback will be used on next lookup. userId={}", user.getId(), e);
        }
    }

    public Token findByAccessTokenOrThrow(String accessToken){
        return tokenRepository.findByAccessToken(accessToken)
                .orElseThrow(() -> new RuntimeException("토큰이 유효하지 않습니다."));
    }

    public Token findByRefreshTokenOrThrow(String refreshToken){
        // 1. Redis 조회 (cache hit) — 장애 시 DB로 진행
        String email = null;
        try {
            email = tokenRedisTemplate.opsForValue().get(RT_PREFIX + refreshToken);
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping cache lookup for RT. falling back to DB", e);
        }

        if (email != null) {
            User user = userRepository.findByEmail(email)
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

        // Redis 재적재 (남은 TTL 계산) — best-effort
        try {
            Duration remaining = token.getExpiresAt() != null
                    ? Duration.between(LocalDateTime.now(), token.getExpiresAt())
                    : REFRESH_TTL;
            tokenRedisTemplate.opsForValue().set(RT_PREFIX + refreshToken, token.getUser().getEmailValue(), remaining);
        } catch (Exception e) {
            log.warn("Redis unavailable, could not repopulate RT cache", e);
        }

        return token;
    }

    @Transactional
    public void updateToken(String accessToken, Token token){
        token.updateAccessToken(accessToken);
        tokenRepository.save(token);
    }
}
