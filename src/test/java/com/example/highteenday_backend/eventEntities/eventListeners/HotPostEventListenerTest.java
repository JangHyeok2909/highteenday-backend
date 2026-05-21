package com.example.highteenday_backend.eventEntities.eventListeners;

import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.eventEntities.events.PostReactedEvent;
import com.example.highteenday_backend.eventEntities.events.ScrapToggledEvent;
import com.example.highteenday_backend.services.domain.HotPostService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
@DisplayName("HotPostEventListener")
class HotPostEventListenerTest {

    @Mock private HotPostService hotPostService;

    @InjectMocks private HotPostEventListener listener;

    @Nested
    @DisplayName("onCommentCreated")
    class OnCommentCreated {

        @Test
        @DisplayName("댓글 생성 → 해당 게시글 Hot Score 갱신")
        void updatesHotScore() {
            CommentCreatedEvent event = CommentCreatedEvent.builder()
                    .commentId(1L)
                    .postId(10L)
                    .authorId(2L)
                    .postAuthorId(3L)
                    .content("댓글")
                    .build();

            listener.onCommentCreated(event);

            verify(hotPostService).updateLeaderboardDayScore(10L);
        }
    }

    @Nested
    @DisplayName("onPostReacted")
    class OnPostReacted {

        @Test
        @DisplayName("게시글 반응 → 해당 게시글 Hot Score 갱신")
        void updatesHotScore() {
            PostReactedEvent event = PostReactedEvent.builder()
                    .postId(20L)
                    .build();

            listener.onPostReacted(event);

            verify(hotPostService).updateLeaderboardDayScore(20L);
        }
    }

    @Nested
    @DisplayName("onScrapToggled")
    class OnScrapToggled {

        @Test
        @DisplayName("새 스크랩 → Hot Score 갱신")
        void updatesHotScoreOnNewScrap() {
            ScrapToggledEvent event = ScrapToggledEvent.builder()
                    .postId(30L)
                    .newScrap(true)
                    .build();

            listener.onScrapToggled(event);

            verify(hotPostService).updateLeaderboardDayScore(30L);
        }

        @Test
        @DisplayName("스크랩 취소 → Hot Score 갱신하지 않음")
        void skipsOnScrapCancel() {
            ScrapToggledEvent event = ScrapToggledEvent.builder()
                    .postId(30L)
                    .newScrap(false)
                    .build();

            listener.onScrapToggled(event);

            verify(hotPostService, never()).updateLeaderboardDayScore(30L);
        }
    }
}
