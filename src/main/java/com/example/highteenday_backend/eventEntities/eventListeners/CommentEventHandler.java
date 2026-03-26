package com.example.highteenday_backend.eventEntities.eventListeners;


import com.example.highteenday_backend.domain.notification.Notification;
import com.example.highteenday_backend.domain.notification.NotificationRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.NotificationCategory;
import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.services.domain.HotPostService;
import com.example.highteenday_backend.services.domain.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;


@RequiredArgsConstructor
@Component
public class CommentEventHandler {
    private final NotificationRepository notificationRepository;
    private final HotPostService hotPostService;
    private final UserService userService;
    @TransactionalEventListener
    public void handleCommentCreatedEvent(CommentCreatedEvent event){
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
        //핫스코어 반영
        hotPostService.updateDailyScore(event.getPostId());

    }
}
