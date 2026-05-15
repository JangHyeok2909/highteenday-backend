package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.services.domain.HotPostService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;

import java.util.LinkedHashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("HotScoreScheduler")
class HotScoreSchedulerTest {

    @Mock
    private RedisTemplate<String, Long> hotPidTemplate;
    @Mock
    private HotPostService hotPostService;
    @Mock
    private ZSetOperations<String, Long> zSetOps;

    @InjectMocks
    private HotScoreScheduler hotScoreScheduler;

    @Nested
    @DisplayName("updateHotScore")
    class UpdateHotScore {

        @Test
        @DisplayName("스코어 갱신 후 DB 동기화를 호출한다")
        void callsSyncAfterScoreRefresh() {
            when(hotPidTemplate.opsForZSet()).thenReturn(zSetOps);
            Set<Long> ids = new LinkedHashSet<>();
            ids.add(1L);
            ids.add(2L);
            when(zSetOps.reverseRange(anyString(), eq(0L), eq(49L))).thenReturn(ids);

            hotScoreScheduler.updateHotScore();

            verify(hotPostService).updateLeaderboardDayScore(1L);
            verify(hotPostService).updateLeaderboardDayScore(2L);
            verify(hotPostService).syncLeaderboardDayToDb();
        }

        @Test
        @DisplayName("Redis 장애 시 스케줄러가 크래시하지 않는다")
        void doesNotCrashWhenRedisDown() {
            when(hotPidTemplate.opsForZSet()).thenThrow(new RedisConnectionFailureException("Connection refused"));

            assertThatCode(() -> hotScoreScheduler.updateHotScore())
                    .doesNotThrowAnyException();
        }
    }
}
