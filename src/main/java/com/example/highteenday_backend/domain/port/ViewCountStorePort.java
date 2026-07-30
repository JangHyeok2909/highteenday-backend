package com.example.highteenday_backend.domain.port;

import java.time.Duration;
import java.util.Map;

public interface ViewCountStorePort {

    boolean tryMarkViewed(Long postId, Long userId, Duration ttl);

    void incrementCount(Long postId);

    int getCount(Long postId);

    Map<Long, Integer> consumePendingCounts();
}
