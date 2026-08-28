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

    /** DB 반영 대기 중인 증가분을 읽는다. 읽기만 하고 지우지 않는다 (KI-23). */
    public Map<Long, Integer> peekPendingViewCounts() {
        return viewCountStore.peekPendingCounts();
    }

    /** DB 반영에 성공한 만큼만 카운터에서 뺀다 (KI-23). */
    public void settleViewCounts(Map<Long, Integer> applied) {
        if (applied.isEmpty()) return;
        viewCountStore.settleCounts(applied);
    }
}
