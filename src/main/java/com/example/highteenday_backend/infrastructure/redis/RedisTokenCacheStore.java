package com.example.highteenday_backend.infrastructure.redis;

import com.example.highteenday_backend.aop.ResilientRedis;
import com.example.highteenday_backend.domain.port.TokenCachePort;
import com.example.highteenday_backend.metrics.RedisFallbackMetrics;
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
    private final RedisFallbackMetrics fallbackMetrics;

    private static final String RT_PREFIX = "RT:";

    /** 폴백 카운터의 태그 값. get 은 AOP 를 안 쓰는 경로라 이름을 직접 적는다. */
    private static final String GET = "RedisTokenCacheStore.get";

    @ResilientRedis
    @Override
    public void put(String refreshToken, String email, Duration ttl) {
        tokenRedisTemplate.opsForValue().set(RT_PREFIX + refreshToken, email, ttl);
    }

    @Override
    public Optional<String> get(String refreshToken) {
        fallbackMetrics.register(GET);
        try {
            String email = tokenRedisTemplate.opsForValue().get(RT_PREFIX + refreshToken);
            return Optional.ofNullable(email);
        } catch (Exception e) {
            fallbackMetrics.recordFallback(GET);
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
