package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.aop.ResilientRedisExecutor;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.HotPostService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.redisService.ViewCountService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("ViewCountScheduler")
class ViewCountSchedulerTest {

    @Mock
    private ViewCountService viewCountService;
    @Mock
    private HotPostService hotPostService;
    @Mock
    private PostService postService;
    @Mock
    private ResilientRedisExecutor redisExecutor;

    @InjectMocks
    private ViewCountScheduler scheduler;

    @Nested
    @DisplayName("syncViewsToDB")
    class SyncViewsToDb {

        @Test
        @DisplayName("대기 중인 증가분이 없으면 아무것도 하지 않는다")
        void doesNothingWhenNothingPending() {
            when(viewCountService.peekPendingViewCounts()).thenReturn(Map.of());

            scheduler.syncViewsToDB();

            verify(postService, never()).applyViewCount(anyLong(), anyInt());
            verify(hotPostService, never()).updateLeaderboardDayScore(anyLong());
            verify(viewCountService, never()).settleViewCounts(anyMap());
        }

        @Test
        @DisplayName("각 게시글에 조회수를 반영하고 핫스코어를 갱신한다")
        void appliesIncrementAndUpdatesHotScore() {
            when(viewCountService.peekPendingViewCounts()).thenReturn(Map.of(1L, 5, 2L, 1));

            scheduler.syncViewsToDB();

            verify(postService).applyViewCount(1L, 5);
            verify(postService).applyViewCount(2L, 1);
            verify(hotPostService).updateLeaderboardDayScore(1L);
            verify(hotPostService).updateLeaderboardDayScore(2L);
        }
    }

    /**
     * 드레인 순서와 DB 실패 시 증가분 보존을 검증한다.
     *
     * 예전에는 Redis 카운터를 GETDEL 로 먼저 지우고 DB 에 반영했다. 반영이 실패하면
     * 이미 지워진 증가분을 되돌릴 수 없어 통째로 유실됐다.
     */
    @Nested
    @DisplayName("드레인 순서")
    class DrainOrder {

        @Test
        @DisplayName("DB 반영이 먼저, 카운터 차감이 나중이다")
        void appliesToDbBeforeSettling() {
            when(viewCountService.peekPendingViewCounts()).thenReturn(Map.of(1L, 5));

            scheduler.syncViewsToDB();

            InOrder order = inOrder(postService, viewCountService);
            order.verify(postService).applyViewCount(1L, 5);
            order.verify(viewCountService).settleViewCounts(anyMap());
        }

        @Test
        @DisplayName("DB 반영에 실패한 게시글의 증가분은 차감하지 않는다 — 다음 주기에 다시 시도된다")
        void keepsCounterWhenDbApplyFails() {
            when(viewCountService.peekPendingViewCounts()).thenReturn(Map.of(1L, 5, 2L, 3));
            lenient().doThrow(new IllegalStateException("db down")).when(postService).applyViewCount(1L, 5);

            scheduler.syncViewsToDB();

            ArgumentCaptor<Map<Long, Integer>> settled = ArgumentCaptor.forClass(Map.class);
            verify(viewCountService).settleViewCounts(settled.capture());

            assertThat(settled.getValue())
                    .as("실패한 게시글을 차감하면 그 조회수는 영영 사라진다")
                    .doesNotContainKey(1L)
                    .containsEntry(2L, 3);
        }

        @Test
        @DisplayName("실패해도 나머지 게시글은 계속 반영한다")
        void continuesAfterOneFailure() {
            when(viewCountService.peekPendingViewCounts()).thenReturn(Map.of(9L, 1, 10L, 2));
            lenient().doThrow(new IllegalStateException("boom")).when(postService).applyViewCount(9L, 1);

            scheduler.syncViewsToDB();

            verify(postService).applyViewCount(10L, 2);
            verify(hotPostService).updateLeaderboardDayScore(10L);
            verify(hotPostService, never()).updateLeaderboardDayScore(9L);
        }

        /**
         * 랭킹 갱신도 Redis 호출이다. DB 반영과 차감 사이에 두면 그 호출들이 서킷을 열 수
         * 있고, 서킷이 열리면 차감이 거절된다. 그러면 DB 에는 반영됐는데 Redis 카운터는
         * 남아 있어 같은 증가분이 다음 주기에 또 더해진다.
         */
        @Test
        @DisplayName("랭킹 갱신은 차감 뒤에 한다 — 사이에 Redis 를 부르면 차감이 막힐 수 있다")
        void updatesRankingAfterSettling() {
            when(viewCountService.peekPendingViewCounts()).thenReturn(Map.of(1L, 5));

            scheduler.syncViewsToDB();

            InOrder order = inOrder(viewCountService, hotPostService);
            order.verify(viewCountService).settleViewCounts(anyMap());
            order.verify(hotPostService).updateLeaderboardDayScore(1L);
        }

        @Test
        @DisplayName("서킷이 열려 있으면 주기를 통째로 건너뛴다")
        void skipsCycleWhenCircuitIsOpen() {
            when(redisExecutor.isOpen()).thenReturn(true);

            scheduler.syncViewsToDB();

            verify(viewCountService, never()).peekPendingViewCounts();
            verify(postService, never()).applyViewCount(anyLong(), anyInt());
            verify(viewCountService, never()).settleViewCounts(anyMap());
        }

        @Test
        @DisplayName("삭제된 게시글은 반영된 것으로 쳐서 정리한다 — 안 그러면 매 주기 같은 실패를 반복한다")
        void settlesDeletedPost() {
            when(viewCountService.peekPendingViewCounts()).thenReturn(Map.of(9L, 4));
            doThrow(new ResourceNotFoundException("gone")).when(postService).applyViewCount(9L, 4);

            scheduler.syncViewsToDB();

            ArgumentCaptor<Map<Long, Integer>> settled = ArgumentCaptor.forClass(Map.class);
            verify(viewCountService).settleViewCounts(settled.capture());

            assertThat(settled.getValue()).containsEntry(9L, 4);
            verify(hotPostService, never()).updateLeaderboardDayScore(9L);
        }
    }
}
