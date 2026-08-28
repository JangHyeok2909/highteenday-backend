package com.example.highteenday_backend.infrastructure.redis;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;

import java.time.Duration;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 핫랭킹 ZSET 키에 만료가 걸리는지 고정한다 (docs/KNOWN-ISSUES.md KI-20).
 *
 * 왜 서비스가 아니라 어댑터에서 보는가: 결함은 "TTL 을 안 걸었다"였고 그 행위는
 * 이 클래스에만 있다. 서비스 테스트는 TTL 값을 넘기는지까지만 보므로,
 * 어댑터가 그 값을 무시해도 통과한다.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("RedisHotPostRanking")
class RedisHotPostRankingTest {

    @Mock
    private RedisTemplate<String, Long> longRedisTemplate;

    @Mock
    private ZSetOperations<String, Long> zSetOperations;

    @InjectMocks
    private RedisHotPostRanking ranking;

    @Test
    @DisplayName("점수를 기록할 때 키에 TTL 을 함께 건다 — 없으면 지나간 버킷이 영원히 남는다")
    void addScoreSetsTtl() {
        when(longRedisTemplate.opsForZSet()).thenReturn(zSetOperations);
        String key = "hot:leaderboard:day:20260828";

        ranking.addScore(key, 1L, 3.5, Duration.ofDays(2));

        verify(zSetOperations).add(eq(key), eq(1L), eq(3.5));
        verify(longRedisTemplate).expire(eq(key), eq(Duration.ofDays(2)));
    }

    @Test
    @DisplayName("호출자가 준 TTL 을 그대로 쓴다 — 버킷 종류마다 수명이 다르다")
    void addScoreUsesCallerTtl() {
        when(longRedisTemplate.opsForZSet()).thenReturn(zSetOperations);
        String key = "hot:board:1realtime:202608281030";

        ranking.addScore(key, 2L, 1.0, Duration.ofMinutes(30));

        verify(longRedisTemplate).expire(eq(key), eq(Duration.ofMinutes(30)));
    }
}
