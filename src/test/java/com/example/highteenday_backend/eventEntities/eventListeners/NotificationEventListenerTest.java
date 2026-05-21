package com.example.highteenday_backend.eventEntities.eventListeners;

import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestAcceptedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestSentEvent;
import com.example.highteenday_backend.services.domain.NotificationService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
@DisplayName("NotificationEventListener")
class NotificationEventListenerTest {

    @Mock private NotificationService notificationService;

    @InjectMocks private NotificationEventListener listener;

    @Nested
    @DisplayName("onCommentCreated")
    class OnCommentCreated {

        @Test
        @DisplayName("댓글 생성 이벤트 → createCommentNotification 호출")
        void delegatesToService() {
            CommentCreatedEvent event = CommentCreatedEvent.builder()
                    .commentId(1L)
                    .postId(10L)
                    .authorId(2L)
                    .postAuthorId(3L)
                    .content("댓글 내용")
                    .build();

            listener.onCommentCreated(event);

            verify(notificationService).createCommentNotification(2L, 3L, 10L, "댓글 내용");
        }
    }

    @Nested
    @DisplayName("onFriendRequestSent")
    class OnFriendRequestSent {

        @Test
        @DisplayName("친구 요청 이벤트 → createFriendRequestNotification 호출")
        void delegatesToService() {
            FriendRequestSentEvent event = FriendRequestSentEvent.builder()
                    .requesterId(1L)
                    .receiverId(2L)
                    .build();

            listener.onFriendRequestSent(event);

            verify(notificationService).createFriendRequestNotification(1L, 2L);
        }
    }

    @Nested
    @DisplayName("onFriendRequestAccepted")
    class OnFriendRequestAccepted {

        @Test
        @DisplayName("친구 수락 이벤트 → createFriendAcceptNotification 호출")
        void delegatesToService() {
            FriendRequestAcceptedEvent event = FriendRequestAcceptedEvent.builder()
                    .requesterId(1L)
                    .receiverId(2L)
                    .build();

            listener.onFriendRequestAccepted(event);

            verify(notificationService).createFriendAcceptNotification(1L, 2L);
        }
    }
}
