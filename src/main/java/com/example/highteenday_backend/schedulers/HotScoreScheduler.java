package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.aop.SchedulerJob;
import com.example.highteenday_backend.services.domain.HotPostService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

/**
 * 일간 핫게시글 점수를 5분마다 재계산하고 DB에 동기화하는 배치.
 *
 * 왜 필요한가: 반응·댓글·스크랩은 이벤트로 즉시 점수를 갱신하지만, 산식의 시간 감쇠
 * ((경과시간+2)^1.5 분모)는 시간이 흐르는 것만으로 점수를 낮춘다. 아무 행동이 없어도
 * 순위가 내려가야 하므로 주기 재계산이 필요하다.
 *
 * 범위가 "당일 리더보드 상위 50개"인 이유: 전체 게시글 재계산은 게시글 수에 비례해
 * 비싸지고, 시간 감쇠 보정이 의미 있는 대상은 이미 순위권에 있는 글뿐이다. 대신
 * 상위 50위 밖 게시글의 취소(반응/스크랩 취소 등) 보정은 이 배치로도 이뤄지지 않는다
 * — 상세는 docs/domains/reaction-hotpost.md.
 *
 * 마지막의 syncLeaderboardDayToDb()는 Redis 장애 시 fallback 조회에 쓰이는
 * daily_hot_post 테이블을 채운다.
 */
@Slf4j
@RequiredArgsConstructor
@Component
public class HotScoreScheduler {
    private final HotPostService hotPostService;

    @Scheduled(fixedRate = 5 * 60 * 1000)
    @Transactional
    @SchedulerJob(name = "HotScoreUpdate")
    public void updateHotScore() {
        Set<Long> range = hotPostService.getLeaderboardDayPostIds(50);
        if (range.isEmpty()) {
            log.debug("No hot posts to refresh.");
            return;
        }
        log.info("Refreshing hot scores. count={}", range.size());
        for (Long pid : range) {
            hotPostService.updateLeaderboardDayScore(pid);
        }
        hotPostService.syncLeaderboardDayToDb();
    }
}
