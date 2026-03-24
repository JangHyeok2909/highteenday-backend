package com.example.highteenday_backend.services.domain.redisService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.*;

@Slf4j
@RequiredArgsConstructor
@Service
public class ViewCountService {
    private final StringRedisTemplate redisTemplate;

    private static final Duration DEDUP_TTL = Duration.ofHours(1);
    private static final String VIEW_COUNT_PREFIX = "post:views:";
    private static final String DEDUP_PREFIX = "viewed:";

    public void increaseViewCount(Long postId, Long userId) {
        String dedupKey = DEDUP_PREFIX + postId + ":" + userId;
        String countKey = VIEW_COUNT_PREFIX + postId;

        Boolean isNew = redisTemplate.opsForValue().setIfAbsent(dedupKey, "1", DEDUP_TTL);
        if (Boolean.TRUE.equals(isNew)) {
            log.debug("조회수 증가. postId={}, userId={}", postId, userId);
            redisTemplate.opsForValue().increment(countKey);
        }
    }

    public int getViewCount(Long postId) {
        String countKey = VIEW_COUNT_PREFIX + postId;
        String value = redisTemplate.opsForValue().get(countKey);
        return value != null ? Integer.parseInt(value) : 0;
    }

    /**
     * Redis에 쌓인 조회수 증분을 원자적으로 꺼내고(GETDEL) 삭제한다.
     * getValue() → delete() 사이의 유실 문제를 GETDEL로 해결.
     */
    public Map<Long, Long> drainViewCounts() {
        Set<String> keys = redisTemplate.keys(VIEW_COUNT_PREFIX + "*");
        if (keys == null || keys.isEmpty()) return Collections.emptyMap();

        Map<Long, Long> result = new HashMap<>();
        for (String key : keys) {
            String value = redisTemplate.opsForValue().getAndDelete(key);
            if (value == null) continue;

            Long postId = Long.parseLong(key.replace(VIEW_COUNT_PREFIX, ""));
            Long increment = Long.parseLong(value);
            result.put(postId, increment);
        }
        return result;
    }
}
