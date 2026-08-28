package com.example.highteenday_backend.infrastructure.redis;

import com.example.highteenday_backend.aop.ResilientRedis;
import com.example.highteenday_backend.domain.port.HotPostRankingPort;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class RedisHotPostRanking implements HotPostRankingPort {

    private final RedisTemplate<String, Long> longRedisTemplate;

    @ResilientRedis
    @Override
    public void addScore(String key, Long postId, double score) {
        longRedisTemplate.opsForZSet().add(key, postId, score);
    }

    @ResilientRedis
    @Override
    public Set<Long> topPostIds(String key, int count) {
        Set<Long> ids = longRedisTemplate.opsForZSet().reverseRange(key, 0, (long) count - 1);
        return ids != null ? ids : Collections.emptySet();
    }

    @ResilientRedis
    @Override
    public List<ScoredPost> topPostsWithScores(String key, int count) {
        Set<ZSetOperations.TypedTuple<Long>> tuples =
                longRedisTemplate.opsForZSet().reverseRangeWithScores(key, 0, (long) count - 1);
        if (tuples == null || tuples.isEmpty()) return Collections.emptyList();

        List<ScoredPost> result = new ArrayList<>(tuples.size());
        for (ZSetOperations.TypedTuple<Long> tuple : tuples) {
            result.add(new ScoredPost(tuple.getValue(), tuple.getScore()));
        }
        return result;
    }

    @ResilientRedis
    @Override
    public void remove(String key, Long postId) {
        longRedisTemplate.opsForZSet().remove(key, postId);
    }
}
