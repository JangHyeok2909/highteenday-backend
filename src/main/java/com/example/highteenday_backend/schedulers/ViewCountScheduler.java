package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.HotPostService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.redisService.ViewCountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Slf4j
@RequiredArgsConstructor
@Component
public class ViewCountScheduler {
    private final ViewCountService viewCountService;
    private final HotPostService hotPostService;
    private final PostService postService;

    @Scheduled(fixedRate = 60000)
    public void syncViewsToDB() {
        Map<Long, Long> viewCounts = viewCountService.drainViewCounts();
        if (viewCounts.isEmpty()) return;

        int synced = 0;
        for (Map.Entry<Long, Long> entry : viewCounts.entrySet()) {
            try {
                applyViewCount(entry.getKey(), entry.getValue());
                synced++;
                //핫스코어 갱신
                hotPostService.updateDailyScore(entry.getKey());
            } catch (ResourceNotFoundException e) {
                log.warn("조회수 동기화 스킵 - 삭제된 게시글. postId={}", entry.getKey());
            }
        }
        log.info("조회수 배치 동기화 완료. 성공={}건 / 전체={}건", synced, viewCounts.size());
    }

    @Transactional
    public void applyViewCount(Long postId, long increment) {
        Post post = postService.findById(postId);
        post.addViewCount((int) increment);
        log.debug("조회수 동기화 완료. postId={}, increment={}", postId, increment);
    }
}
