package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.hot.DailyHotPost;
import com.example.highteenday_backend.domain.hot.DailyHotPostRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.PostPreviewDto;
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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("HotPostService")
class HotPostServiceTest {

    @Mock
    private RedisTemplate<String, Long> hotPidTemplate;
    @Mock
    private PostService postService;
    @Mock
    private DailyHotPostRepository dailyHotPostRepository;
    @Mock
    private ZSetOperations<String, Long> zSetOps;

    @InjectMocks
    private HotPostService hotPostService;

    private void stubZSet() {
        when(hotPidTemplate.opsForZSet()).thenReturn(zSetOps);
    }

    private Post mockPost(Long id, int likeCount) {
        Post post = mock(Post.class, withSettings().lenient());
        Board board = mock(Board.class, withSettings().lenient());
        when(post.getId()).thenReturn(id);
        when(post.getLikeCount()).thenReturn(likeCount);
        when(post.getBoard()).thenReturn(board);
        when(board.getId()).thenReturn(1L);
        when(post.isAnonymous()).thenReturn(true);
        when(post.getCreated()).thenReturn(LocalDateTime.now().minusHours(1));
        when(post.getIsValid()).thenReturn(true);
        return post;
    }

    @Nested
    @DisplayName("updateLeaderboardDayScore")
    class UpdateLeaderboardDayScore {

        @Test
        @DisplayName("게시글이 있으면 당일 리더보드 키에 ZSET 점수를 갱신한다")
        void addsScoreWhenPostExists() {
            stubZSet();
            long postId = 99L;
            Post post = mock(Post.class);
            when(post.getLikeCount()).thenReturn(5);
            when(post.getDislikeCount()).thenReturn(0);
            when(post.getScrapCount()).thenReturn(0);
            when(post.getViewCount()).thenReturn(0);
            when(post.getCommentCount()).thenReturn(0);
            when(post.getCreated()).thenReturn(LocalDateTime.now().minusHours(1));
            when(postService.findOptionalById(postId)).thenReturn(Optional.of(post));

            String expectedKey = HotPostService.leaderboardDayRedisKey(LocalDate.now());

            hotPostService.updateLeaderboardDayScore(postId);

            verify(zSetOps).add(eq(expectedKey), eq(postId), anyDouble());
        }

        @Test
        @DisplayName("게시글이 없으면 Redis에서 해당 postId를 제거한다")
        void removesFromRedisWhenPostMissing() {
            stubZSet();
            long postId = 404L;
            when(postService.findOptionalById(postId)).thenReturn(Optional.empty());

            String expectedKey = HotPostService.leaderboardDayRedisKey(LocalDate.now());

            hotPostService.updateLeaderboardDayScore(postId);

            verify(zSetOps).remove(eq(expectedKey), eq(postId));
        }

        @Test
        @DisplayName("Redis 장애 시 예외를 삼키고 정상 반환한다")
        void swallowsExceptionWhenRedisDown() {
            Post post = mockPost(1L, 10);
            when(postService.findOptionalById(1L)).thenReturn(Optional.of(post));
            when(hotPidTemplate.opsForZSet()).thenThrow(new RedisConnectionFailureException("Connection refused"));

            assertThatCode(() -> hotPostService.updateLeaderboardDayScore(1L))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("getLeaderboardDayHotPosts")
    class GetLeaderboardDayHotPosts {

        @Test
        @DisplayName("Redis 정상 시 ZSET에서 인기글을 조회한다")
        void returnsFromRedisWhenAvailable() {
            stubZSet();
            Post post1 = mockPost(1L, 15);
            Post post2 = mockPost(2L, 12);

            Set<Long> ids = new LinkedHashSet<>(List.of(1L, 2L));
            when(zSetOps.reverseRange(anyString(), eq(0L), eq(9L))).thenReturn(ids);
            when(postService.findOptionalById(1L)).thenReturn(Optional.of(post1));
            when(postService.findOptionalById(2L)).thenReturn(Optional.of(post2));

            List<PostPreviewDto> result = hotPostService.getLeaderboardDayHotPosts();

            assertThat(result).hasSize(2);
            verify(dailyHotPostRepository, never()).findTop10ByLeaderboardDateOrderByCreatedDesc(any());
        }

        @Test
        @DisplayName("Redis 장애 시 DB 폴백으로 인기글을 조회한다")
        void fallsBackToDbWhenRedisUnavailable() {
            when(hotPidTemplate.opsForZSet()).thenThrow(new RedisConnectionFailureException("Connection refused"));

            Post post1 = mockPost(1L, 15);
            Post post2 = mockPost(2L, 12);
            List<DailyHotPost> dbEntries = List.of(
                    DailyHotPost.builder().post(post1).score(5.0).leaderboardDate(LocalDate.now()).build(),
                    DailyHotPost.builder().post(post2).score(3.0).leaderboardDate(LocalDate.now()).build()
            );
            when(dailyHotPostRepository.findTop10ByLeaderboardDateOrderByCreatedDesc(LocalDate.now()))
                    .thenReturn(dbEntries);

            List<PostPreviewDto> result = hotPostService.getLeaderboardDayHotPosts();

            assertThat(result).hasSize(2);
            verify(dailyHotPostRepository).findTop10ByLeaderboardDateOrderByCreatedDesc(LocalDate.now());
        }

        @Test
        @DisplayName("Redis 장애 + DB에도 데이터 없으면 빈 리스트 반환")
        void returnsEmptyWhenBothUnavailable() {
            when(hotPidTemplate.opsForZSet()).thenThrow(new RedisConnectionFailureException("Connection refused"));
            when(dailyHotPostRepository.findTop10ByLeaderboardDateOrderByCreatedDesc(LocalDate.now()))
                    .thenReturn(List.of());

            List<PostPreviewDto> result = hotPostService.getLeaderboardDayHotPosts();

            assertThat(result).isEmpty();
        }
    }

    @Nested
    @DisplayName("syncLeaderboardDayToDb")
    class SyncLeaderboardDayToDb {

        @Test
        @DisplayName("DB에 없는 게시글만 새로 저장한다")
        void syncsOnlyNewPostsToDb() {
            stubZSet();
            Post post1 = mockPost(1L, 15);
            Post post2 = mockPost(2L, 12);

            Set<ZSetOperations.TypedTuple<Long>> tuples = new LinkedHashSet<>();
            tuples.add(ZSetOperations.TypedTuple.of(1L, 5.0));
            tuples.add(ZSetOperations.TypedTuple.of(2L, 3.0));
            when(zSetOps.reverseRangeWithScores(anyString(), eq(0L), eq(49L))).thenReturn(tuples);
            when(postService.findOptionalById(1L)).thenReturn(Optional.of(post1));
            when(postService.findOptionalById(2L)).thenReturn(Optional.of(post2));
            when(dailyHotPostRepository.findByPostAndLeaderboardDate(post1, LocalDate.now()))
                    .thenReturn(Optional.empty());
            when(dailyHotPostRepository.findByPostAndLeaderboardDate(post2, LocalDate.now()))
                    .thenReturn(Optional.empty());

            hotPostService.syncLeaderboardDayToDb();

            verify(dailyHotPostRepository, times(2)).save(any(DailyHotPost.class));
        }

        @Test
        @DisplayName("이미 DB에 있는 게시글은 중복 저장하지 않는다")
        void skipsAlreadyExistingPost() {
            stubZSet();
            Post post1 = mockPost(1L, 15);
            Post post2 = mockPost(2L, 12);
            DailyHotPost existingDhp = mock(DailyHotPost.class);

            Set<ZSetOperations.TypedTuple<Long>> tuples = new LinkedHashSet<>();
            tuples.add(ZSetOperations.TypedTuple.of(1L, 5.0));
            tuples.add(ZSetOperations.TypedTuple.of(2L, 3.0));
            when(zSetOps.reverseRangeWithScores(anyString(), eq(0L), eq(49L))).thenReturn(tuples);
            when(postService.findOptionalById(1L)).thenReturn(Optional.of(post1));
            when(postService.findOptionalById(2L)).thenReturn(Optional.of(post2));
            when(dailyHotPostRepository.findByPostAndLeaderboardDate(post1, LocalDate.now()))
                    .thenReturn(Optional.of(existingDhp));
            when(dailyHotPostRepository.findByPostAndLeaderboardDate(post2, LocalDate.now()))
                    .thenReturn(Optional.empty());

            hotPostService.syncLeaderboardDayToDb();

            verify(dailyHotPostRepository, times(1)).save(any(DailyHotPost.class));
        }

        @Test
        @DisplayName("Redis 장애 시 DB 동기화를 건너뛴다")
        void skipsWhenRedisUnavailable() {
            when(hotPidTemplate.opsForZSet()).thenThrow(new RedisConnectionFailureException("Connection refused"));

            assertThatCode(() -> hotPostService.syncLeaderboardDayToDb())
                    .doesNotThrowAnyException();
            verify(dailyHotPostRepository, never()).save(any());
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
