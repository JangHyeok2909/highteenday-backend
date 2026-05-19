package com.example.highteenday_backend.domain.port;

import java.util.Collections;
import java.util.List;
import java.util.Set;

public interface HotPostRankingPort {

    void addScore(String key, Long postId, double score);

    Set<Long> topPostIds(String key, int count);

    List<ScoredPost> topPostsWithScores(String key, int count);

    void remove(String key, Long postId);

    record ScoredPost(Long postId, Double score) {}
}
