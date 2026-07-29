package com.example.highteenday_backend.infrastructure.redis;

import com.example.highteenday_backend.aop.ResilientRedis;
import com.example.highteenday_backend.domain.port.TokenCachePort;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Optional;

@Slf4j
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

    @Override
    public Optional<String> get(String refreshToken) {
        try {
            String email = tokenRedisTemplate.opsForValue().get(RT_PREFIX + refreshToken);
            return Optional.ofNullable(email);
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping cache lookup for RT. falling back to DB", e);
            return Optional.empty();
        }
    }

    @ResilientRedis
    @Override
    public void delete(String refreshToken) {
        tokenRedisTemplate.delete(RT_PREFIX + refreshToken);
    }
}
