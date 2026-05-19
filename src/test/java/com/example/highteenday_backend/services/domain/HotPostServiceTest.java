package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.hot.DailyHotPost;
import com.example.highteenday_backend.domain.hot.DailyHotPostRepository;
import com.example.highteenday_backend.domain.port.HotPostRankingPort;
import com.example.highteenday_backend.domain.port.HotPostRankingPort.ScoredPost;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("HotPostService")
class HotPostServiceTest {

    @Mock
    private HotPostRankingPort hotPostRanking;
    @Mock
    private PostService postService;
    @Mock
    private DailyHotPostRepository dailyHotPostRepository;

    @InjectMocks
    private HotPostService hotPostService;

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
        @DisplayName("게시글이 있으면 당일 리더보드 키에 점수를 갱신한다")
        void addsScoreWhenPostExists() {
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

            verify(hotPostRanking).addScore(eq(expectedKey), eq(postId), anyDouble());
        }

        @Test
        @DisplayName("게시글이 없으면 해당 postId를 제거한다")
        void removesWhenPostMissing() {
            long postId = 404L;
            when(postService.findOptionalById(postId)).thenReturn(Optional.empty());

            String expectedKey = HotPostService.leaderboardDayRedisKey(LocalDate.now());

            hotPostService.updateLeaderboardDayScore(postId);

            verify(hotPostRanking).remove(eq(expectedKey), eq(postId));
        }
    }

    @Nested
    @DisplayName("getLeaderboardDayHotPosts")
    class GetLeaderboardDayHotPosts {

        @Test
        @DisplayName("랭킹에서 인기글을 조회한다")
        void returnsFromRanking() {
            Post post1 = mockPost(1L, 15);
            Post post2 = mockPost(2L, 12);

            Set<Long> ids = new LinkedHashSet<>(List.of(1L, 2L));
            when(hotPostRanking.topPostIds(anyString(), eq(10))).thenReturn(ids);
            when(postService.findOptionalById(1L)).thenReturn(Optional.of(post1));
            when(postService.findOptionalById(2L)).thenReturn(Optional.of(post2));

            List<PostPreviewDto> result = hotPostService.getLeaderboardDayHotPosts();

            assertThat(result).hasSize(2);
            verify(dailyHotPostRepository, never()).findTop10ByLeaderboardDateOrderByCreatedDesc(any());
        }

        @Test
        @DisplayName("랭킹이 비어있으면 DB 폴백으로 조회한다")
        void fallsBackToDbWhenEmpty() {
            when(hotPostRanking.topPostIds(anyString(), eq(10))).thenReturn(Collections.emptySet());

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
        @DisplayName("랭킹 빈 결과 + DB에도 데이터 없으면 빈 리스트 반환")
        void returnsEmptyWhenBothEmpty() {
            when(hotPostRanking.topPostIds(anyString(), eq(10))).thenReturn(Collections.emptySet());
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
            Post post1 = mockPost(1L, 15);
            Post post2 = mockPost(2L, 12);

            List<ScoredPost> scoredPosts = List.of(
                    new ScoredPost(1L, 5.0),
                    new ScoredPost(2L, 3.0)
            );
            when(hotPostRanking.topPostsWithScores(anyString(), eq(50))).thenReturn(scoredPosts);
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
            Post post1 = mockPost(1L, 15);
            Post post2 = mockPost(2L, 12);
            DailyHotPost existingDhp = mock(DailyHotPost.class);

            List<ScoredPost> scoredPosts = List.of(
                    new ScoredPost(1L, 5.0),
                    new ScoredPost(2L, 3.0)
            );
            when(hotPostRanking.topPostsWithScores(anyString(), eq(50))).thenReturn(scoredPosts);
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
        @DisplayName("랭킹 결과가 비어있으면 DB 동기화를 건너뛴다")
        void skipsWhenRankingEmpty() {
            when(hotPostRanking.topPostsWithScores(anyString(), eq(50))).thenReturn(Collections.emptyList());

            hotPostService.syncLeaderboardDayToDb();

            verify(dailyHotPostRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("updateRecentScore")
    class UpdateRecentScore {

        @Test
        @DisplayName("게시글의 점수를 랭킹에 추가한다")
        void addsScoreToRanking() {
            Post post = mockPost(1L, 5);

            hotPostService.updateRecentScore(post);

            verify(hotPostRanking).addScore(anyString(), eq(1L), anyDouble());
        }
    }

    @Nested
    @DisplayName("getRecentHotPosts")
    class GetRecentHotPosts {

        @Test
        @DisplayName("랭킹에서 게시글을 조회한다")
        void returnsPostsFromRanking() {
            Post post1 = mockPost(1L, 5);
            Post post2 = mockPost(2L, 3);
            Set<Long> ids = new LinkedHashSet<>(List.of(1L, 2L));
            when(hotPostRanking.topPostIds(anyString(), eq(3))).thenReturn(ids);
            when(postService.findOptionalById(1L)).thenReturn(Optional.of(post1));
            when(postService.findOptionalById(2L)).thenReturn(Optional.of(post2));

            List<PostPreviewDto> result = hotPostService.getRecentHotPosts(1L);

            assertThat(result).hasSize(2);
        }

        @Test
        @DisplayName("랭킹이 비어있으면 빈 리스트를 반환한다")
        void returnsEmptyListWhenRankingEmpty() {
            when(hotPostRanking.topPostIds(anyString(), eq(3))).thenReturn(Collections.emptySet());

            List<PostPreviewDto> result = hotPostService.getRecentHotPosts(1L);

            assertThat(result).isEmpty();
        }
    }

    @Nested
    @DisplayName("getLeaderboardDayPostIds")
    class GetLeaderboardDayPostIds {

        @Test
        @DisplayName("지정된 수만큼 포스트 ID를 반환한다")
        void returnsPostIds() {
            Set<Long> ids = new LinkedHashSet<>(List.of(1L, 2L, 3L));
            when(hotPostRanking.topPostIds(anyString(), eq(50))).thenReturn(ids);

            Set<Long> result = hotPostService.getLeaderboardDayPostIds(50);

            assertThat(result).containsExactly(1L, 2L, 3L);
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
