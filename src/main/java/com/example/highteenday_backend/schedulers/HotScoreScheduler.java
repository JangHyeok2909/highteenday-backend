package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.aop.SchedulerJob;
import com.example.highteenday_backend.services.domain.HotPostService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

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
