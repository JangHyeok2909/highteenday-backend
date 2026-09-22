package com.example.highteenday_backend.infrastructure.redis;

import com.example.highteenday_backend.aop.ResilientRedis;
import com.example.highteenday_backend.domain.port.TokenCachePort;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

@Component
@RequiredArgsConstructor
public class RedisTokenCacheStore implements TokenCachePort {

    private final StringRedisTemplate tokenRedisTemplate;

    private static final String RT_PREFIX = "RT:";

    @ResilientRedis
    @Override
    public void put(String refreshToken, String email, Duration ttl) {
        tokenRedisTemplate.opsForValue().set(RT_PREFIX + refreshToken, email, ttl);
    }

    /** Redis 를 쓰지 못하면 {@code Optional.empty()}가 되고, 호출자는 DB 를 읽는다. */
    @ResilientRedis
    @Override
    public Optional<String> get(String refreshToken) {
        return Optional.ofNullable(tokenRedisTemplate.opsForValue().get(RT_PREFIX + refreshToken));
    }

    @ResilientRedis
    @Override
    public void delete(String refreshToken) {
        tokenRedisTemplate.delete(RT_PREFIX + refreshToken);
    }
}
