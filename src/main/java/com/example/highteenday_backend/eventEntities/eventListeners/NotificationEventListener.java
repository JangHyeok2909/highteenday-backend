package com.example.highteenday_backend.eventEntities.eventListeners;

import com.example.highteenday_backend.domain.notification.Notification;
import com.example.highteenday_backend.domain.notification.NotificationRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.EntityType;
import com.example.highteenday_backend.enums.NotificationCategory;
import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestAcceptedEvent;
import com.example.highteenday_backend.eventEntities.events.FriendRequestSentEvent;
import com.example.highteenday_backend.services.domain.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class NotificationEventListener {
    private final NotificationRepository notificationRepository;
    private final UserService userService;

    @Transactional
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCommentCreated(CommentCreatedEvent event) {
        User sender = userService.findById(event.getAuthorId());
        User receiver = userService.findById(event.getPostAuthorId());
        notificationRepository.save(
                Notification.builder()
                        .receiver(receiver)
                        .sender(sender)
                        .category(NotificationCategory.POST_COMMENT)
                        .message("내 게시글에 댓글이 달렸습니다.")
                        .contentMessage(event.getContent())
                        .build()
        );
    }

    @Transactional
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFriendRequestSent(FriendRequestSentEvent event) {
        User requester = userService.findById(event.getRequesterId());
        User receiver = userService.findById(event.getReceiverId());
        notificationRepository.save(
                Notification.builder()
                        .receiver(receiver)
                        .sender(requester)
                        .category(NotificationCategory.FRIEND_REQUEST)
                        .entityType(EntityType.USER)
                        .entityId(requester.getId())
                        .message(receiver.getNickname() + "님에게 친구 요청을 보냈습니다.")
                        .build()
        );
    }

    @Transactional
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFriendRequestAccepted(FriendRequestAcceptedEvent event) {
        User requester = userService.findById(event.getRequesterId());
        User receiver = userService.findById(event.getReceiverId());
        notificationRepository.save(
                Notification.builder()
                        .receiver(receiver)
                        .sender(requester)
                        .category(NotificationCategory.FRIEND_ACCEPT)
                        .entityType(EntityType.USER)
                        .entityId(requester.getId())
                        .message(receiver.getNickname() + "님이 친구 요청을 수락했습니다.")
                        .build()
        );
    }
}
