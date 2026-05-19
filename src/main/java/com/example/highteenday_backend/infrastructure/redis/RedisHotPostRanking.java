package com.example.highteenday_backend.infrastructure.redis;

import com.example.highteenday_backend.domain.port.HotPostRankingPort;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class RedisHotPostRanking implements HotPostRankingPort {

    private final RedisTemplate<String, Long> hotPidTemplate;

    @Override
    public void addScore(String key, Long postId, double score) {
        try {
            hotPidTemplate.opsForZSet().add(key, postId, score);
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping addScore. key={}, postId={}", key, postId, e);
        }
    }

    @Override
    public Set<Long> topPostIds(String key, int count) {
        try {
            Set<Long> ids = hotPidTemplate.opsForZSet().reverseRange(key, 0, (long) count - 1);
            return ids != null ? ids : Collections.emptySet();
        } catch (Exception e) {
            log.warn("Redis unavailable, returning empty set for topPostIds. key={}", key, e);
            return Collections.emptySet();
        }
    }

    @Override
    public List<ScoredPost> topPostsWithScores(String key, int count) {
        try {
            Set<ZSetOperations.TypedTuple<Long>> tuples =
                    hotPidTemplate.opsForZSet().reverseRangeWithScores(key, 0, (long) count - 1);
            if (tuples == null || tuples.isEmpty()) return Collections.emptyList();

            List<ScoredPost> result = new ArrayList<>(tuples.size());
            for (ZSetOperations.TypedTuple<Long> tuple : tuples) {
                result.add(new ScoredPost(tuple.getValue(), tuple.getScore()));
            }
            return result;
        } catch (Exception e) {
            log.warn("Redis unavailable, returning empty list for topPostsWithScores. key={}", key, e);
            return Collections.emptyList();
        }
    }

    @Override
    public void remove(String key, Long postId) {
        try {
            hotPidTemplate.opsForZSet().remove(key, postId);
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping remove. key={}, postId={}", key, postId, e);
        }
    }
}
