package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("HotPostService")
class HotPostServiceTest {

    @Mock
    private RedisTemplate<String, Long> hotPidTemplate;
    @Mock
    private PostService postService;
    @Mock
    private ZSetOperations<String, Long> zSetOps;

    @InjectMocks
    private HotPostService hotPostService;

    private void stubZSet() {
        when(hotPidTemplate.opsForZSet()).thenReturn(zSetOps);
    }

    @Nested
    @DisplayName("updateDailyScore")
    class UpdateDailyScore {

        @Test
        @DisplayName("게시글이 있으면 당일 키에 ZSET 점수를 갱신한다")
        void addsScoreWhenPostExists() {
            stubZSet();
            long postId = 99L;
            Post post = org.mockito.Mockito.mock(Post.class);
            when(post.getLikeCount()).thenReturn(5);
            when(post.getDislikeCount()).thenReturn(0);
            when(post.getScrapCount()).thenReturn(0);
            when(post.getViewCount()).thenReturn(0);
            when(post.getCommentCount()).thenReturn(0);
            when(post.getCreated()).thenReturn(LocalDateTime.now().minusHours(1));
            when(postService.findOptionalById(postId)).thenReturn(Optional.of(post));

            String expectedKey = "hot:all:daily:" + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));

            hotPostService.updateDailyScore(postId);

            verify(zSetOps).add(eq(expectedKey), eq(postId), anyDouble());
        }

        @Test
        @DisplayName("게시글이 없으면 Redis에서 해당 postId를 제거한다")
        void removesFromRedisWhenPostMissing() {
            stubZSet();
            long postId = 404L;
            when(postService.findOptionalById(postId)).thenReturn(Optional.empty());

            String expectedKey = "hot:all:daily:" + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));

            hotPostService.updateDailyScore(postId);

            verify(zSetOps).remove(eq(expectedKey), eq(postId));
        }
    }

    @Nested
    @DisplayName("getKey / getRealtime5Min")
    class KeyFormatting {

        @Test
        @DisplayName("getKey는 보드 id와 realtime 접두를 포함한다")
        void getKeyContainsBoardAndRealtime() {
            String key = hotPostService.getKey(7L);

            assertThat(key).startsWith("hot:board:7realtime:");
            assertThat(key).hasSizeGreaterThan("hot:board:7realtime:".length());
        }

        @Test
        @DisplayName("getRealtime5Min은 yyyyMMddHHmm 12자리 형식이다")
        void realtimeKeyIsTwelveDigits() {
            String rt = hotPostService.getRealtime5Min();

            assertThat(rt).matches("\\d{12}");
            assertThat(rt).hasSize(12);
        }

        @Test
        @DisplayName("getRealtime5Min의 분은 5분 단위로 내린다")
        void realtimeMinuteFlooredToFiveMinutes() {
            String rt = hotPostService.getRealtime5Min();
            int minute = Integer.parseInt(rt.substring(10, 12));

            assertThat(minute % 5).isZero();
        }
    }
}
