package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.aop.ResilientRedisExecutor;
import com.example.highteenday_backend.aop.SchedulerJob;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.HotPostService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.redisService.ViewCountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Redis에 버퍼링된 조회수 증가분을 60초마다 DB로 반영하는 배치.
 *
 * 왜 버퍼링하는가: 조회수를 조회 시점마다 DB UPDATE하면 인기 게시글 한 행에 쓰기가
 * 집중된다(hot row). 그래서 조회는 Redis INCR로만 기록하고, 이 배치가 게시글별
 * 누적분을 모아 한 번에 반영한다. 데이터 경계와 손실 정책은 docs/architecture.md에 있다.
 *
 * <h2>순서와 트랜잭션 경계</h2>
 *
 * 이 메서드에는 {@code @Transactional}이 없다. 게시글 단위 트랜잭션은
 * {@code postService.applyViewCount()}가 가지며, 그쪽은 별도 빈이라 프록시를 거친다.
 * 예전에는 이 클래스가 {@code this.applyViewCount()}를 직접 불러 그 메서드의
 * {@code @Transactional}이 무시됐고, 배치 전체가 바깥 트랜잭션 하나로 묶여
 * 게시글 하나의 실패가 주기 전체를 되돌렸다.
 *
 * 정리 순서도 뒤집었다. <b>읽기 → DB 반영 → 반영한 만큼 차감 → 랭킹 갱신</b>이다.
 * 예전에는 Redis에서 먼저 지우고 DB에 반영해서, 반영이 실패하면 이미 지워진
 * 증가분이 복구되지 않았다. 지금은 실패한 게시글의 증가분이 Redis에 남아
 * 다음 주기에 다시 시도된다.
 *
 * 랭킹 갱신이 마지막인 이유는 서킷브레이커 때문이다. 랭킹 갱신도 Redis 호출이라,
 * DB 반영과 차감 사이에 두면 그 호출들이 서킷을 열 수 있다. 서킷이 열리면 차감이
 * 거절되는데 DB에는 이미 반영돼 있으므로, 같은 증가분이 다음 주기에 또 더해진다.
 */
@Slf4j
@RequiredArgsConstructor
@Component
public class ViewCountScheduler {
    private final ViewCountService viewCountService;
    private final HotPostService hotPostService;
    private final PostService postService;
    private final ResilientRedisExecutor redisExecutor;

    @Scheduled(fixedDelay = 60000)
    @SchedulerJob(name = "ViewCountSync")
    public void syncViewsToDB() {
        // 서킷이 이미 열려 있으면 차감이 거절될 것이 확정이므로 시작하지 않는다. 증가분은
        // Redis에 그대로 남아 다음 주기에 처리된다.
        if (redisExecutor.isOpen()) {
            log.warn("View count sync skipped — Redis circuit is OPEN");
            return;
        }

        Map<Long, Integer> pending = viewCountService.peekPendingViewCounts();
        if (pending.isEmpty()) return;

        // DB 반영에 성공한 것만 모은다. 실패한 게시글의 증가분은 Redis에 남겨
        // 다음 주기에 다시 시도되게 한다.
        Map<Long, Integer> applied = new HashMap<>();
        // 랭킹을 갱신할 게시글. 삭제된 게시글은 정산 대상이지만 랭킹 대상은 아니다.
        List<Long> toRank = new ArrayList<>();

        for (Map.Entry<Long, Integer> entry : pending.entrySet()) {
            Long postId = entry.getKey();
            Integer increment = entry.getValue();
            try {
                postService.applyViewCount(postId, increment);
                applied.put(postId, increment);
                toRank.add(postId);
            } catch (ResourceNotFoundException e) {
                // 삭제된 게시글은 다시 시도해도 성공하지 않는다. 카운터를 남겨 두면
                // 매 주기 같은 실패를 반복하므로 반영된 것으로 쳐서 정리한다.
                log.warn("View count sync skipped — deleted post. postId={}", postId);
                applied.put(postId, increment);
            } catch (Exception e) {
                log.error("View count sync failed for postId={}. increment={}", postId, increment, e);
            }
        }

        viewCountService.settleViewCounts(applied);

        // 랭킹 갱신은 정산 뒤로 미룬다. DB 반영과 차감 사이에 Redis를 부르면 그 호출이
        // 서킷을 열 수 있고, 그러면 차감이 거절되는데 DB에는 이미 반영돼 있어 같은
        // 증가분이 다음 주기에 또 더해진다. 랭킹 점수는 DB의 조회수에서 다시 계산하므로
        // 정산 전후 어느 쪽에서 불러도 값이 같다.
        for (Long postId : toRank) {
            hotPostService.updateLeaderboardDayScore(postId);
        }

        log.info("View count batch sync complete. synced={}, total={}", applied.size(), pending.size());
    }
}
