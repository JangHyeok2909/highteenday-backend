package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.notification.Notification;
import com.example.highteenday_backend.domain.notification.NotificationRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.NotificationDto;
import com.example.highteenday_backend.dtos.paged.PagedNotificationsDto;
import com.example.highteenday_backend.enums.EntityType;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.NotificationCategory;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import com.example.highteenday_backend.services.global.AfterCommitExecutor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;


@RequiredArgsConstructor
@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserService userService;
    private final SimpMessagingTemplate messagingTemplate;
    private final AfterCommitExecutor afterCommitExecutor;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void createCommentNotification(Long senderId, Long receiverId, Long postId, String content) {
        User sender = userService.findById(senderId);
        User receiver = userService.findById(receiverId);
        saveNotification(sender, receiver, NotificationCategory.POST_COMMENT,
                EntityType.POST, postId, "내 게시글에 댓글이 달렸습니다.", content);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void createFriendRequestNotification(Long requesterId, Long receiverId) {
        User requester = userService.findById(requesterId);
        User receiver = userService.findById(receiverId);
        saveNotification(requester, receiver, NotificationCategory.FRIEND_REQUEST,
                EntityType.USER, requesterId, requester.getNicknameValue() + "님이 친구 요청을 보냈습니다.", null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void createFriendAcceptNotification(Long requesterId, Long receiverId) {
        User requester = userService.findById(requesterId);
        User receiver = userService.findById(receiverId);
        saveNotification(receiver, requester, NotificationCategory.FRIEND_ACCEPT,
                EntityType.USER, receiverId, receiver.getNicknameValue() + "님이 친구 요청을 수락했습니다.", null);
    }

    private void saveNotification(User sender, User receiver, NotificationCategory category,
                                  EntityType entityType, Long entityId,
                                  String message, String contentMessage) {
        // 자기 자신에게는 알림을 보내지 않는다 (내 글에 내가 댓글을 단 경우 등).
        if (sender.getId().equals(receiver.getId())) {
            return;
        }

        Notification notification = notificationRepository.save(
                Notification.builder()
                        .receiver(receiver)
                        .sender(sender)
                        .category(category)
                        .entityType(entityType)
                        .entityId(entityId)
                        .message(message)
                        .contentMessage(contentMessage)
                        .build()
        );

        // 커밋 이후에 발행한다. 커밋 전에 보내면 롤백 시 DB 에 없는 알림이 클라이언트
        // 알림함에 떠 있고, 새로고침하면 사라지는 유령 알림이 된다 (docs/KNOWN-ISSUES.md KI-24).
        NotificationDto dto = NotificationDto.fromEntity(notification);
        String receiverId = String.valueOf(receiver.getId());
        afterCommitExecutor.run(() -> messagingTemplate.convertAndSendToUser(
                receiverId, "/queue/notifications", dto
        ));
    }

    @Transactional(readOnly = true)
    public PagedNotificationsDto getNotifications(User user, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<Notification> pagedResult = notificationRepository
                .findByReceiverAndIsValidTrueOrderByIsReadAscCreatedDesc(user, pageable);

        List<NotificationDto> dtos = pagedResult.getContent().stream()
                .map(NotificationDto::fromEntity)
                .toList();

        return PagedNotificationsDto.builder()
                .page(pagedResult.getNumber())
                .totalPages(pagedResult.getTotalPages())
                .totalElements(pagedResult.getTotalElements())
                .notifications(dtos)
                .build();
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(User user) {
        return notificationRepository.countByReceiverAndIsValidTrueAndIsReadFalse(user);
    }

    @Transactional
    public NotificationDto markAsRead(Long notificationId, User user) {
        Notification notification = findByIdOrThrow(notificationId);
        validateOwnership(notification, user);
        notification.markAsRead();
        return NotificationDto.fromEntity(notification);
    }

    @Transactional
    public void markAllAsRead(User user) {
        notificationRepository.markAllAsReadByReceiver(user);
    }

    @Transactional
    public void deleteReadNotifications(User user) {
        notificationRepository.softDeleteReadByReceiver(user);
    }

    @Transactional
    public void deleteNotification(Long notificationId, User user) {
        Notification notification = findByIdOrThrow(notificationId);
        validateOwnership(notification, user);
        notification.delete();
    }

    private Notification findByIdOrThrow(Long id) {
        return notificationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("notification does not exist, id=" + id));
    }

    private void validateOwnership(Notification notification, User user) {
        if (!notification.getReceiver().getId().equals(user.getId())) {
            throw new CustomException(ErrorCode.NO_ACCESS);
        }
    }
}
