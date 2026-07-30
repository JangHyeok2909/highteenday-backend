package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.services.domain.HotPostService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("HotScoreScheduler")
class HotScoreSchedulerTest {

    @Mock
    private HotPostService hotPostService;

    @InjectMocks
    private HotScoreScheduler hotScoreScheduler;

    @Nested
    @DisplayName("updateHotScore")
    class UpdateHotScore {

        @Test
        @DisplayName("스코어 갱신 후 DB 동기화를 호출한다")
        void callsSyncAfterScoreRefresh() {
            Set<Long> ids = new LinkedHashSet<>();
            ids.add(1L);
            ids.add(2L);
            when(hotPostService.getLeaderboardDayPostIds(50)).thenReturn(ids);

            hotScoreScheduler.updateHotScore();

            verify(hotPostService).updateLeaderboardDayScore(1L);
            verify(hotPostService).updateLeaderboardDayScore(2L);
            verify(hotPostService).syncLeaderboardDayToDb();
        }

        @Test
        @DisplayName("인기글이 없으면 갱신을 건너뛴다")
        void skipsWhenNoHotPosts() {
            when(hotPostService.getLeaderboardDayPostIds(50)).thenReturn(Collections.emptySet());

            hotScoreScheduler.updateHotScore();

            verify(hotPostService, never()).updateLeaderboardDayScore(anyLong());
            verify(hotPostService, never()).syncLeaderboardDayToDb();
        }

    }
}
