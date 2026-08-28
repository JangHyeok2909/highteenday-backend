package com.example.highteenday_backend.domain.port;

import java.time.Duration;
import java.util.List;
import java.util.Set;

public interface HotPostRankingPort {

    /**
     * ZSET에 점수를 기록하고 키의 만료 시각을 갱신한다.
     *
     * <p>TTL을 호출자가 넘기는 이유: 키는 시간 버킷이라 종류마다 수명이 다르다.
     * 일자 리더보드는 하루가 지나면 다시 읽히지 않고, 5분 실시간 버킷은 몇십 분이면
     * 끝난다. 어댑터가 키 이름을 보고 추측하면 새 버킷을 추가할 때마다 어댑터를
     * 고쳐야 하므로, 수명을 아는 쪽이 직접 말하게 한다.
     *
     * <p>TTL이 없으면 지나간 날짜·시각의 ZSET이 영원히 남아 Redis 메모리가 단조
     * 증가한다 (docs/KNOWN-ISSUES.md KI-20).
     */
    void addScore(String key, Long postId, double score, Duration ttl);

    Set<Long> topPostIds(String key, int count);

    List<ScoredPost> topPostsWithScores(String key, int count);

    void remove(String key, Long postId);

    record ScoredPost(Long postId, Double score) {}
}
