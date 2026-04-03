package com.example.highteenday_backend.services.domain.redisService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ViewCountService")
class ViewCountServiceTest {

    private static final String VIEW_COUNT_PREFIX = "post:views:";
    private static final String DEDUP_PREFIX = "viewed:";

    @Mock
    private StringRedisTemplate redisTemplate;
    @Mock
    private ValueOperations<String, String> valueOps;

    private ViewCountService viewCountService;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
        viewCountService = new ViewCountService(redisTemplate);
    }

    @Nested
    @DisplayName("increaseViewCount")
    class IncreaseViewCount {

        @Test
        @DisplayName("첫 조회 -> dedupKey 생성 + countKey+1 증가")
        void incrementWhenFirstView() {
            long postId = 999L;
            long userId = 888L;
            String dedupKey = DEDUP_PREFIX + postId + ":" + userId;
            String countKey = VIEW_COUNT_PREFIX + postId;

            when(valueOps.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(true);

            viewCountService.increaseViewCount(postId, userId);

            verify(valueOps).setIfAbsent(eq(dedupKey), eq("1"), any(Duration.class));
            verify(valueOps).increment(eq(countKey));
        }

        @Test
        @DisplayName("중복 조회 -> increment x")
        void notIncrementWhenDuplView() {
            when(valueOps.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(false);

            viewCountService.increaseViewCount(10L, 20L);

            verify(valueOps, never()).increment(anyString());
        }
    }

    @Nested
    @DisplayName("getViewCount")
    class GetViewCount {

        @Test
        @DisplayName("키가 없으면 0")
        void returnsZeroWhenMissing() {
            when(valueOps.get(VIEW_COUNT_PREFIX+5)).thenReturn(null);

            assertThat(viewCountService.getViewCount(5L)).isZero();
        }

        @Test
        @DisplayName("parsing: String value -> integer value ")
        void returnsParsedInt() {
            when(valueOps.get(VIEW_COUNT_PREFIX+5L)).thenReturn("42");

            assertThat(viewCountService.getViewCount(5L)).isEqualTo(42);
        }
    }

    @Nested
    @DisplayName("drainViewCounts")
    class DrainViewCounts {

        @Test
        @DisplayName("키가 없으면 빈 맵")
        void emptyWhenNoKeys() {
            when(redisTemplate.keys(VIEW_COUNT_PREFIX+"*")).thenReturn(Collections.emptySet());

            assertThat(viewCountService.drainViewCounts()).isEmpty();
        }

        @Test
        @DisplayName("keys가 null이면 빈 맵")
        void emptyWhenKeysNull() {
            when(redisTemplate.keys(VIEW_COUNT_PREFIX+"*")).thenReturn(null);

            assertThat(viewCountService.drainViewCounts()).isEmpty();
        }

        @Test
        @DisplayName("viewCount increment getAndDelete check")
        void buildsMapFromGetAndDelete() {
            Set<String> keys = new HashSet<>();
            keys.add("post:views:7");
            keys.add("post:views:8");
            when(redisTemplate.keys(VIEW_COUNT_PREFIX+"*")).thenReturn(keys);
            when(valueOps.getAndDelete(VIEW_COUNT_PREFIX+"7")).thenReturn("3");
            when(valueOps.getAndDelete(VIEW_COUNT_PREFIX+"8")).thenReturn("1");

            Map<Long, Integer> out = viewCountService.drainViewCounts();

            assertThat(out).containsEntry(7L, 3).containsEntry(8L, 1);
        }

        @Test
        @DisplayName("key의 value가 null인 키는 result 맵에 추가하지 않는다.")
        void skipsNullValue() {
            when(redisTemplate.keys(VIEW_COUNT_PREFIX+"*")).thenReturn(Set.of(VIEW_COUNT_PREFIX+1L));
            when(valueOps.getAndDelete(VIEW_COUNT_PREFIX+1L)).thenReturn(null);

            assertThat(viewCountService.drainViewCounts()).isEmpty();
        }
    }
}
