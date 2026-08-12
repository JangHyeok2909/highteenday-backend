package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.aop.SchedulerJob;
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

/**
 * Redis에 버퍼링된 조회수 증가분을 60초마다 DB로 반영하는 배치.
 *
 * 왜 버퍼링하는가: 조회수를 조회 시점마다 DB UPDATE하면 인기 게시글 한 행에 쓰기가
 * 집중된다(hot row). 그래서 조회는 Redis INCR로만 기록하고, 이 배치가 게시글별
 * 누적분을 모아 한 번에 반영한다. 설계 배경: docs/adr/adr-002-viewcount-redis-buffer.md
 *
 * 유실 허용 계약: drainViewCounts()가 Redis 카운터를 GETDEL로 "꺼내면서 삭제"하므로,
 * 이후 DB 반영이 실패한 증가분은 되돌아가지 않고 사라진다. 조회수는 정확성보다
 * 가용성을 우선하기로 한 데이터라 의도된 트레이드오프다 — 단 배치 전체가 커밋에
 * 실패하면 이번 주기 증가분 전체가 유실될 수 있다 (docs/KNOWN-ISSUES.md KI-23).
 */
@Slf4j
@RequiredArgsConstructor
@Component
public class ViewCountScheduler {
    private final ViewCountService viewCountService;
    private final HotPostService hotPostService;
    private final PostService postService;



    @Scheduled(fixedDelay = 60000)
    @Transactional
    @SchedulerJob(name = "ViewCountSync")
    public void syncViewsToDB() {
        Map<Long, Integer> viewCounts = viewCountService.drainViewCounts();
        if (viewCounts.isEmpty()) return;

        int synced = 0;
        for (Map.Entry<Long, Integer> entry : viewCounts.entrySet()) {
            try {
                applyViewCount(entry.getKey(), entry.getValue());
                synced++;
                hotPostService.updateLeaderboardDayScore(entry.getKey());
            } catch (ResourceNotFoundException e) {
                log.warn("View count sync skipped — deleted post. postId={}", entry.getKey());
            } catch (Exception e) {
                log.error("View count sync failed for postId={}. increment={}", entry.getKey(), entry.getValue(), e);
            }
        }
        log.info("View count batch sync complete. synced={}, total={}", synced, viewCounts.size());
    }

    // 주의: syncViewsToDB()가 this.applyViewCount()로 직접 호출하므로 이 @Transactional은
    // 프록시를 거치지 않아 게시글 단위의 독립 트랜잭션으로 동작하지 않는다.
    // 실제로는 배치 전체가 syncViewsToDB()의 트랜잭션 하나로 묶인다 (KI-23).
    @Transactional
    public void applyViewCount(Long postId, int increment) {
        Post post = postService.findById(postId);
        post.addViewCount(increment);
        log.debug("View count applied. postId={}, increment={}", postId, increment);
    }
}
