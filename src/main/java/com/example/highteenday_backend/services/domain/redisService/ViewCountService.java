package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.domain.port.ViewCountStorePort;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;

@Slf4j
@RequiredArgsConstructor
@Service
public class ViewCountService {
    private final ViewCountStorePort viewCountStore;

    private static final Duration DEDUP_TTL = Duration.ofHours(1);

    public void increaseViewCount(Long postId, Long userId) {
        boolean isNew = viewCountStore.tryMarkViewed(postId, userId, DEDUP_TTL);
        if (isNew) {
            log.debug("View count incremented. postId={}, userId={}", postId, userId);
            viewCountStore.incrementCount(postId);
        }
    }

    public int getViewCount(Long postId) {
        return viewCountStore.getCount(postId);
    }

    public Map<Long, Integer> drainViewCounts() {
        return viewCountStore.consumePendingCounts();
    }
}
