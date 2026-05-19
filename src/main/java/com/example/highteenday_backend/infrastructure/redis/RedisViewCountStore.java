package com.example.highteenday_backend.infrastructure.redis;

import com.example.highteenday_backend.domain.port.ViewCountStorePort;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class RedisViewCountStore implements ViewCountStorePort {

    private final StringRedisTemplate redisTemplate;

    private static final String VIEW_COUNT_PREFIX = "post:views:";
    private static final String DEDUP_PREFIX = "viewed:";

    @Override
    public boolean tryMarkViewed(Long postId, Long userId, Duration ttl) {
        try {
            String dedupKey = DEDUP_PREFIX + postId + ":" + userId;
            Boolean isNew = redisTemplate.opsForValue().setIfAbsent(dedupKey, "1", ttl);
            return Boolean.TRUE.equals(isNew);
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping tryMarkViewed. postId={}, userId={}", postId, userId, e);
            return false;
        }
    }

    @Override
    public void incrementCount(Long postId) {
        try {
            String countKey = VIEW_COUNT_PREFIX + postId;
            redisTemplate.opsForValue().increment(countKey);
        } catch (Exception e) {
            log.warn("Redis unavailable, view count increment lost. postId={}", postId, e);
        }
    }

    @Override
    public int getCount(Long postId) {
        try {
            String countKey = VIEW_COUNT_PREFIX + postId;
            String value = redisTemplate.opsForValue().get(countKey);
            return value != null ? Integer.parseInt(value) : 0;
        } catch (Exception e) {
            log.warn("Redis unavailable, returning 0 for view count. postId={}", postId, e);
            return 0;
        }
    }

    @Override
    public Map<Long, Integer> consumePendingCounts() {
        try {
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
        } catch (Exception e) {
            log.warn("Redis unavailable, consumePendingCounts returning empty map", e);
            return Collections.emptyMap();
        }
    }
}
