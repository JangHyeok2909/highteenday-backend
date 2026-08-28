package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.Token.Token;
import com.example.highteenday_backend.domain.Token.TokenRepository;
import com.example.highteenday_backend.domain.port.TokenCachePort;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * 리프레시/액세스 토큰의 저장·조회·회전.
 *
 * <p>실패는 전부 {@link CustomException} 이다. 예전에는 raw {@code RuntimeException} 이라
 * {@code GlobalExceptionHandler} 의 500 경로로 떨어졌고, <b>리프레시 토큰 만료라는 정상
 * 시나리오가 500</b> 이 됐다. 클라이언트는 401 을 못 받으니 "재로그인시켜야 하는 상황"과
 * "서버가 고장난 상황"을 구분할 수 없었다 (docs/KNOWN-ISSUES.md KI-14).
 *
 * <p>만료({@code TOKEN_EXPIRED})와 무효({@code INVALID_TOKEN})를 나눈 이유: 둘 다 401 이지만
 * 클라이언트 동작이 다르다. 만료는 조용히 재로그인으로 보내면 되고, 무효는 토큰이 위조·
 * 폐기된 것이라 저장된 자격증명을 지워야 한다.
 */
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
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND, "사용자 없음 - TokenService.java"));
        tokenRepository.findByUser(user).ifPresent(token -> {
            tokenCache.delete(token.getRefreshToken());
            tokenRepository.delete(token);
        });
    }

    @Transactional
    public void saveOrUpdate(String userKey, String refreshToken, String accessToken){
        User user = userRepository.findByEmail(userKey)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND, "사용자 없음 - TokenService.java"));

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
                .orElseThrow(() -> new CustomException(ErrorCode.INVALID_TOKEN, "토큰이 유효하지 않습니다."));
    }

    public Token findByRefreshTokenOrThrow(String refreshToken){
        // 1. Redis 조회 (cache hit) — 장애 시 Optional.empty() 반환
        Optional<String> cachedEmail = tokenCache.get(refreshToken);

        if (cachedEmail.isPresent()) {
            User user = userRepository.findByEmail(cachedEmail.get())
                    .orElseThrow(() -> new CustomException(ErrorCode.INVALID_TOKEN, "리프레시 토큰이 유효하지 않습니다."));
            return tokenRepository.findByUser(user)
                    .orElseThrow(() -> new CustomException(ErrorCode.INVALID_TOKEN, "리프레시 토큰이 유효하지 않습니다."));
        }

        // 2. Redis miss → DB 조회
        Token token = tokenRepository.findByRefreshToken(refreshToken)
                .orElseThrow(() -> new CustomException(ErrorCode.INVALID_TOKEN, "리프레시 토큰이 유효하지 않습니다."));

        // 만료된 토큰이면 DB에서 삭제 후 예외
        if (token.getExpiresAt() != null && token.getExpiresAt().isBefore(LocalDateTime.now())) {
            tokenRepository.delete(token);
            throw new CustomException(ErrorCode.TOKEN_EXPIRED, "리프레시 토큰이 만료되었습니다.");
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
