package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.domain.port.ViewCountStorePort;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.util.Collections;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("ViewCountService")
class ViewCountServiceTest {

    @Mock
    private ViewCountStorePort viewCountStore;

    @InjectMocks
    private ViewCountService viewCountService;

    @Nested
    @DisplayName("increaseViewCount")
    class IncreaseViewCount {

        @Test
        @DisplayName("첫 조회 -> 조회수 증가")
        void incrementWhenFirstView() {
            long postId = 999L;
            long userId = 888L;
            when(viewCountStore.tryMarkViewed(eq(postId), eq(userId), any(Duration.class))).thenReturn(true);

            viewCountService.increaseViewCount(postId, userId);

            verify(viewCountStore).tryMarkViewed(eq(postId), eq(userId), any(Duration.class));
            verify(viewCountStore).incrementCount(postId);
        }

        @Test
        @DisplayName("중복 조회 -> increment x")
        void notIncrementWhenDuplView() {
            when(viewCountStore.tryMarkViewed(eq(10L), eq(20L), any(Duration.class))).thenReturn(false);

            viewCountService.increaseViewCount(10L, 20L);

            verify(viewCountStore, never()).incrementCount(any());
        }
    }

    @Nested
    @DisplayName("getViewCount")
    class GetViewCount {

        @Test
        @DisplayName("저장소에서 조회수를 반환한다")
        void returnsCountFromStore() {
            when(viewCountStore.getCount(5L)).thenReturn(42);

            assertThat(viewCountService.getViewCount(5L)).isEqualTo(42);
        }

        @Test
        @DisplayName("저장소가 0을 반환하면 0을 반환한다")
        void returnsZeroWhenStoreReturnsZero() {
            when(viewCountStore.getCount(5L)).thenReturn(0);

            assertThat(viewCountService.getViewCount(5L)).isZero();
        }
    }

    /**
     * 읽기와 정리를 나눈 뒤의 동작 (docs/KNOWN-ISSUES.md KI-23).
     * 예전 이름은 drainViewCounts 였고, 읽으면서 지우는 하나의 연산이었다.
     */
    @Nested
    @DisplayName("peekPendingViewCounts / settleViewCounts")
    class PeekAndSettle {

        @Test
        @DisplayName("저장소에서 누적 조회수를 읽는다")
        void readsFromStore() {
            Map<Long, Integer> expected = Map.of(7L, 3, 8L, 1);
            when(viewCountStore.peekPendingCounts()).thenReturn(expected);

            Map<Long, Integer> result = viewCountService.peekPendingViewCounts();

            assertThat(result).containsEntry(7L, 3).containsEntry(8L, 1);
        }

        @Test
        @DisplayName("읽기만으로는 저장소를 정리하지 않는다")
        void peekDoesNotSettle() {
            when(viewCountStore.peekPendingCounts()).thenReturn(Map.of(7L, 3));

            viewCountService.peekPendingViewCounts();

            verify(viewCountStore, never()).settleCounts(anyMap());
        }

        @Test
        @DisplayName("저장소가 빈 맵을 반환하면 빈 맵을 반환한다")
        void returnsEmptyWhenStoreEmpty() {
            when(viewCountStore.peekPendingCounts()).thenReturn(Collections.emptyMap());

            assertThat(viewCountService.peekPendingViewCounts()).isEmpty();
        }

        @Test
        @DisplayName("반영된 만큼을 저장소에 넘겨 차감한다")
        void settlesAppliedCounts() {
            Map<Long, Integer> applied = Map.of(7L, 3);

            viewCountService.settleViewCounts(applied);

            verify(viewCountStore).settleCounts(applied);
        }

        @Test
        @DisplayName("반영된 것이 없으면 저장소를 건드리지 않는다")
        void skipsStoreWhenNothingApplied() {
            viewCountService.settleViewCounts(Collections.emptyMap());

            verify(viewCountStore, never()).settleCounts(anyMap());
        }
    }
}
