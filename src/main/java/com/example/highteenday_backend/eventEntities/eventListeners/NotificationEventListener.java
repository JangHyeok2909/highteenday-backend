package com.example.highteenday_backend.eventEntities.eventListeners;

import com.example.highteenday_backend.aop.AsyncNotification;
import com.example.highteenday_backend.enums.NotificationEventType;
import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestAcceptedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestSentEvent;
import com.example.highteenday_backend.services.domain.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class NotificationEventListener {

    private final NotificationService notificationService;

    @AsyncNotification(eventType = NotificationEventType.COMMENT_CREATED)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCommentCreated(CommentCreatedEvent event) {
        notificationService.createCommentNotification(
                event.getAuthorId(), event.getPostAuthorId(),
                event.getPostId(), event.getContent());
    }

    @AsyncNotification(eventType = NotificationEventType.FRIEND_REQUEST_SENT)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFriendRequestSent(FriendRequestSentEvent event) {
        notificationService.createFriendRequestNotification(
                event.getRequesterId(), event.getReceiverId());
    }

    @AsyncNotification(eventType = NotificationEventType.FRIEND_REQUEST_ACCEPTED)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFriendRequestAccepted(FriendRequestAcceptedEvent event) {
        notificationService.createFriendAcceptNotification(
                event.getRequesterId(), event.getReceiverId());
    }
}
