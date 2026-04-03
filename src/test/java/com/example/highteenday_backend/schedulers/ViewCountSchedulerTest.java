package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.HotPostService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.redisService.ViewCountService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.mockito.ArgumentMatchers.anyLong;
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

    @InjectMocks
    private ViewCountScheduler scheduler;

    @Nested
    @DisplayName("syncViewsToDB")
    class SyncViewsToDb {

        @Test
        @DisplayName("drain 결과가 비어 있으면 Post·핫스코어를 호출하지 않는다")
        void doesNothingWhenDrainedEmpty() {
            when(viewCountService.drainViewCounts()).thenReturn(Map.of());

            scheduler.syncViewsToDB();

            verify(postService, never()).findById(anyLong());
            verify(hotPostService, never()).updateDailyScore(anyLong());
        }

        @Test
        @DisplayName("각 게시글에 조회수를 반영하고 핫스코어를 갱신한다")
        void appliesIncrementAndUpdatesHotScore() {
            Post post1 = org.mockito.Mockito.mock(Post.class);
            Post post2 = org.mockito.Mockito.mock(Post.class);
            when(viewCountService.drainViewCounts()).thenReturn(Map.of(1L, 5, 2L, 1));
            when(postService.findById(1L)).thenReturn(post1);
            when(postService.findById(2L)).thenReturn(post2);

            scheduler.syncViewsToDB();

            verify(post1).addViewCount(5);
            verify(post2).addViewCount(1);
            verify(hotPostService).updateDailyScore(1L);
            verify(hotPostService).updateDailyScore(2L);
        }

        @Test
        @DisplayName("게시글이 없으면 조회수 반영 스킵하고 핫스코어도 호출하지 않는다")
        void skipsMissingPostAndHotScore() {
            when(viewCountService.drainViewCounts()).thenReturn(Map.of(9L, 1));
            when(postService.findById(9L)).thenThrow(new ResourceNotFoundException("not found"));

            scheduler.syncViewsToDB();

            verify(hotPostService, never()).updateDailyScore(9L);
        }

        @Test
        @DisplayName("일부만 실패해도 나머지는 동기화하고 핫스코어를 갱신한다")
        void continuesAfterOneFailure() {
            Post okPost = org.mockito.Mockito.mock(Post.class);
            when(viewCountService.drainViewCounts()).thenReturn(Map.of(9L, 1, 10L, 2));
            when(postService.findById(9L)).thenThrow(new ResourceNotFoundException("gone"));
            when(postService.findById(10L)).thenReturn(okPost);

            scheduler.syncViewsToDB();

            verify(hotPostService, never()).updateDailyScore(9L);
            verify(hotPostService).updateDailyScore(10L);
            verify(okPost).addViewCount(2);
        }
    }

    @Nested
    @DisplayName("applyViewCount")
    class ApplyViewCount {

        @Test
        @DisplayName("Post를 찾아 increment 만큼 조회수를 더한다")
        void addsViewCountToPost() {
            Post post = org.mockito.Mockito.mock(Post.class);
            when(postService.findById(3L)).thenReturn(post);

            scheduler.applyViewCount(3L, 7);

            verify(post).addViewCount(7);
        }
    }
}
