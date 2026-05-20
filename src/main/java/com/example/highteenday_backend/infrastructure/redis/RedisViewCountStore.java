package com.example.highteenday_backend.infrastructure.redis;

import com.example.highteenday_backend.aop.ResilientRedis;
import com.example.highteenday_backend.domain.port.ViewCountStorePort;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class RedisViewCountStore implements ViewCountStorePort {

    private final StringRedisTemplate redisTemplate;

    private static final String VIEW_COUNT_PREFIX = "post:views:";
    private static final String DEDUP_PREFIX = "viewed:";

    @ResilientRedis
    @Override
    public boolean tryMarkViewed(Long postId, Long userId, Duration ttl) {
        String dedupKey = DEDUP_PREFIX + postId + ":" + userId;
        Boolean isNew = redisTemplate.opsForValue().setIfAbsent(dedupKey, "1", ttl);
        return Boolean.TRUE.equals(isNew);
    }

    @ResilientRedis
    @Override
    public void incrementCount(Long postId) {
        String countKey = VIEW_COUNT_PREFIX + postId;
        redisTemplate.opsForValue().increment(countKey);
    }

    @ResilientRedis
    @Override
    public int getCount(Long postId) {
        String countKey = VIEW_COUNT_PREFIX + postId;
        String value = redisTemplate.opsForValue().get(countKey);
        return value != null ? Integer.parseInt(value) : 0;
    }

    @ResilientRedis
    @Override
    public Map<Long, Integer> consumePendingCounts() {
        Set<String> keys = redisTemplate.keys(VIEW_COUNT_PREFIX + "*");
        if (keys == null || keys.isEmpty()) return Collections.emptyMap();

        Map<Long, Integer> result = new HashMap<>();
        for (String key : keys) {
            String value = redisTemplate.opsForValue().getAndDelete(key);
            if (value == null) continue;

            Long postId = Long.parseLong(key.replace(VIEW_COUNT_PREFIX, ""));
            Integer increment = Integer.parseInt(value);
            result.put(postId, increment);
        }
        return result;
    }
}
