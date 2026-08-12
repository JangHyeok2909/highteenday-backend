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

/**
 * 조회수 버퍼의 Redis 구현 (ViewCountStorePort의 Adapter).
 *
 * 키 두 종류를 쓴다.
 * - viewed:{postId}:{userId} — 같은 사용자의 중복 조회를 TTL 동안 1회로 접는 dedup 마커
 * - post:views:{postId}      — DB 반영 대기 중인 증가분 카운터 (ViewCountScheduler가 소비)
 *
 * 모든 메서드는 @ResilientRedis로 감싸여 Redis 장애 시 예외 대신 기본값을 돌려준다 —
 * 조회수 기록이 실패해도 게시글 조회 자체는 계속 동작해야 하기 때문이다.
 */
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

    /**
     * 대기 중인 카운터를 전부 꺼내면서 삭제한다 (소비 시맨틱).
     *
     * GETDEL로 읽기와 삭제를 원자화해 "읽은 뒤 삭제 전에 들어온 증가분"의 유실은 막지만,
     * 반환된 값이 DB에 반영되지 못하면 그 증가분은 복구되지 않는다 — 호출자(스케줄러)가
     * 유실 허용을 전제로 한다.
     *
     * 주의: KEYS는 전체 키스페이스를 훑는 블로킹 O(N) 명령이라 키가 많아지면 60초마다
     * 같은 Redis를 쓰는 다른 캐시까지 멈칫하게 만든다. SCAN 전환이 남은 과제다 (KI-17).
     */
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
