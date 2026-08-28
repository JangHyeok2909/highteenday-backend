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
     * 대기 중인 카운터를 읽기만 한다 — 지우지 않는다 (KI-23).
     *
     * 예전에는 GETDEL로 읽으면서 지웠다. 읽기·삭제는 원자적이었지만, 그 뒤 DB 반영이
     * 실패하면 이미 사라진 증가분을 되돌릴 방법이 없었다. 이제 정리는 반영에 성공한
     * 뒤 {@link #settleCounts(Map)}가 한다.
     *
     * 주의: KEYS는 전체 키스페이스를 훑는 블로킹 O(N) 명령이라 키가 많아지면 60초마다
     * 같은 Redis를 쓰는 다른 캐시까지 멈칫하게 만든다. SCAN 전환이 남은 과제다 (KI-17).
     */
    @ResilientRedis
    @Override
    public Map<Long, Integer> peekPendingCounts() {
        Set<String> keys = redisTemplate.keys(VIEW_COUNT_PREFIX + "*");
        if (keys == null || keys.isEmpty()) return Collections.emptyMap();

        Map<Long, Integer> result = new HashMap<>();
        for (String key : keys) {
            String value = redisTemplate.opsForValue().get(key);
            if (value == null) continue;

            Long postId = Long.parseLong(key.replace(VIEW_COUNT_PREFIX, ""));
            Integer increment = Integer.parseInt(value);
            if (increment <= 0) continue;
            result.put(postId, increment);
        }
        return result;
    }

    /**
     * DB에 반영된 만큼만 카운터에서 뺀다.
     *
     * DEL이 아니라 DECRBY인 이유: peek 이후 DB 반영까지 사이에 들어온 조회수가 이미
     * 카운터에 더해져 있다. 키를 통째로 지우면 그 조회수까지 사라지지만, 반영한 값만
     * 빼면 남은 증가분이 다음 주기로 넘어간다.
     *
     * 차감 결과가 0 이하이면 키를 지운다 — 남겨 두면 값이 0인 키가 계속 쌓여
     * KEYS가 훑어야 할 키스페이스가 단조 증가한다. 차감과 삭제 사이에 새 조회가
     * 끼어들면 그 1건은 유실되지만, 조회수는 정확성보다 가용성을 택한 데이터라
     * 허용 범위다 (adr-002).
     */
    @ResilientRedis
    @Override
    public void settleCounts(Map<Long, Integer> applied) {
        for (Map.Entry<Long, Integer> entry : applied.entrySet()) {
            String countKey = VIEW_COUNT_PREFIX + entry.getKey();
            Long remaining = redisTemplate.opsForValue().decrement(countKey, entry.getValue());
            if (remaining != null && remaining <= 0) {
                redisTemplate.delete(countKey);
            }
        }
    }
}
