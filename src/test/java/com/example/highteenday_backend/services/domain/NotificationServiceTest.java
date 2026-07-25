package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.notification.Notification;
import com.example.highteenday_backend.domain.notification.NotificationRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.dtos.NotificationDto;
import com.example.highteenday_backend.dtos.paged.PagedNotificationsDto;
import com.example.highteenday_backend.enums.EntityType;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.NotificationCategory;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NotificationServiceTest {

    @Mock private NotificationRepository notificationRepository;
    @Mock private UserService userService;
    @Mock private SimpMessagingTemplate messagingTemplate;

    @InjectMocks private NotificationService notificationService;

    private User owner;
    private User otherUser;
    private User sender;

    @BeforeEach
    void setUp() {
        owner = User.builder().id(1L).nickname(new Nickname("owner")).build();
        otherUser = User.builder().id(2L).nickname(new Nickname("other")).build();
        sender = User.builder().id(3L).nickname(new Nickname("sender")).build();

        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private Notification buildNotification(Long id, boolean read) {
        return Notification.builder()
                .id(id)
                .receiver(owner)
                .sender(sender)
                .category(NotificationCategory.POST_COMMENT)
                .entityType(EntityType.POST)
                .entityId(100L)
                .message("내 게시글에 댓글이 달렸습니다.")
                .contentMessage("댓글 내용")
                .isRead(read)
                .build();
    }

    @Nested
    @DisplayName("createCommentNotification")
    class CreateCommentNotification {

        @Test
        @DisplayName("댓글 알림을 생성하고 저장한다")
        void savesCommentNotification() {
            when(userService.findById(3L)).thenReturn(sender);
            when(userService.findById(1L)).thenReturn(owner);

            notificationService.createCommentNotification(3L, 1L, 100L, "댓글 내용");

            ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
            verify(notificationRepository).save(captor.capture());

            Notification saved = captor.getValue();
            assertThat(saved.getSender()).isEqualTo(sender);
            assertThat(saved.getReceiver()).isEqualTo(owner);
            assertThat(saved.getCategory()).isEqualTo(NotificationCategory.POST_COMMENT);
            assertThat(saved.getEntityType()).isEqualTo(EntityType.POST);
            assertThat(saved.getEntityId()).isEqualTo(100L);
            assertThat(saved.getMessage()).isEqualTo("내 게시글에 댓글이 달렸습니다.");
            assertThat(saved.getContentMessage()).isEqualTo("댓글 내용");
        }
    }

    @Nested
    @DisplayName("createFriendRequestNotification")
    class CreateFriendRequestNotification {

        @Test
        @DisplayName("친구 요청 알림을 생성하고 저장한다")
        void savesFriendRequestNotification() {
            when(userService.findById(3L)).thenReturn(sender);
            when(userService.findById(1L)).thenReturn(owner);

            notificationService.createFriendRequestNotification(3L, 1L);

            ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
            verify(notificationRepository).save(captor.capture());

            Notification saved = captor.getValue();
            assertThat(saved.getSender()).isEqualTo(sender);
            assertThat(saved.getReceiver()).isEqualTo(owner);
            assertThat(saved.getCategory()).isEqualTo(NotificationCategory.FRIEND_REQUEST);
            assertThat(saved.getEntityType()).isEqualTo(EntityType.USER);
            assertThat(saved.getEntityId()).isEqualTo(3L);
            assertThat(saved.getMessage()).isEqualTo("sender님이 친구 요청을 보냈습니다.");
            assertThat(saved.getContentMessage()).isNull();
        }
    }

    @Nested
    @DisplayName("createFriendAcceptNotification")
    class CreateFriendAcceptNotification {

        @Test
        @DisplayName("친구 수락 알림을 생성하고 저장한다")
        void savesFriendAcceptNotification() {
            when(userService.findById(3L)).thenReturn(sender);
            when(userService.findById(1L)).thenReturn(owner);

            notificationService.createFriendAcceptNotification(3L, 1L);

            ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
            verify(notificationRepository).save(captor.capture());

            Notification saved = captor.getValue();
            assertThat(saved.getReceiver()).isEqualTo(sender);
            assertThat(saved.getSender()).isEqualTo(owner);
            assertThat(saved.getCategory()).isEqualTo(NotificationCategory.FRIEND_ACCEPT);
            assertThat(saved.getEntityType()).isEqualTo(EntityType.USER);
            assertThat(saved.getEntityId()).isEqualTo(1L);
            assertThat(saved.getMessage()).isEqualTo("owner님이 친구 요청을 수락했습니다.");
            assertThat(saved.getContentMessage()).isNull();
        }
    }

    @Nested
    @DisplayName("getNotifications")
    class GetNotifications {

        @Test
        @DisplayName("페이징 알림 목록을 반환한다")
        void returnsPagedNotifications() {
            Notification n1 = buildNotification(1L, false);
            Notification n2 = buildNotification(2L, true);
            Pageable pageable = PageRequest.of(0, 20);
            Page<Notification> page = new PageImpl<>(List.of(n1, n2), pageable, 2);

            when(notificationRepository.findByReceiverAndIsValidTrueOrderByIsReadAscCreatedDesc(eq(owner), any(Pageable.class)))
                    .thenReturn(page);

            PagedNotificationsDto result = notificationService.getNotifications(owner, 0, 20);

            assertThat(result.getPage()).isEqualTo(0);
            assertThat(result.getTotalElements()).isEqualTo(2);
            assertThat(result.getTotalPages()).isEqualTo(1);
            assertThat(result.getNotifications()).hasSize(2);
            assertThat(result.getNotifications().get(0).isRead()).isFalse();
            assertThat(result.getNotifications().get(1).isRead()).isTrue();
        }

        @Test
        @DisplayName("알림이 없으면 빈 목록을 반환한다")
        void returnsEmptyWhenNoNotifications() {
            Pageable pageable = PageRequest.of(0, 20);
            Page<Notification> emptyPage = new PageImpl<>(List.of(), pageable, 0);

            when(notificationRepository.findByReceiverAndIsValidTrueOrderByIsReadAscCreatedDesc(eq(owner), any(Pageable.class)))
                    .thenReturn(emptyPage);

            PagedNotificationsDto result = notificationService.getNotifications(owner, 0, 20);

            assertThat(result.getNotifications()).isEmpty();
            assertThat(result.getTotalElements()).isEqualTo(0);
        }
    }

    @Nested
    @DisplayName("getUnreadCount")
    class GetUnreadCount {

        @Test
        @DisplayName("읽지 않은 알림 수를 반환한다")
        void returnsUnreadCount() {
            when(notificationRepository.countByReceiverAndIsValidTrueAndIsReadFalse(owner)).thenReturn(5L);

            long count = notificationService.getUnreadCount(owner);

            assertThat(count).isEqualTo(5L);
        }

        @Test
        @DisplayName("모두 읽었으면 0을 반환한다")
        void returnsZeroWhenAllRead() {
            when(notificationRepository.countByReceiverAndIsValidTrueAndIsReadFalse(owner)).thenReturn(0L);

            long count = notificationService.getUnreadCount(owner);

            assertThat(count).isEqualTo(0L);
        }
    }

    @Nested
    @DisplayName("markAsRead")
    class MarkAsRead {

        @Test
        @DisplayName("읽음 처리 후 NotificationDto를 반환한다")
        void marksAsReadAndReturnsDto() {
            Notification notification = buildNotification(1L, false);
            when(notificationRepository.findById(1L)).thenReturn(Optional.of(notification));

            NotificationDto dto = notificationService.markAsRead(1L, owner);

            assertThat(notification.getIsRead()).isTrue();
            assertThat(dto.id()).isEqualTo(1L);
            assertThat(dto.isRead()).isTrue();
            assertThat(dto.entityType()).isEqualTo(EntityType.POST);
            assertThat(dto.entityId()).isEqualTo(100L);
            assertThat(dto.senderNickname()).isEqualTo("sender");
        }

        @Test
        @DisplayName("다른 사용자의 알림이면 NO_ACCESS 예외")
        void throwsWhenNotOwner() {
            Notification notification = buildNotification(1L, false);
            when(notificationRepository.findById(1L)).thenReturn(Optional.of(notification));

            assertThatThrownBy(() -> notificationService.markAsRead(1L, otherUser))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.NO_ACCESS));
        }

        @Test
        @DisplayName("존재하지 않는 알림 ID면 ResourceNotFoundException")
        void throwsWhenNotFound() {
            when(notificationRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> notificationService.markAsRead(999L, owner))
                    .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    @Nested
    @DisplayName("markAllAsRead")
    class MarkAllAsRead {

        @Test
        @DisplayName("벌크 읽음 처리를 호출한다")
        void callsBulkUpdate() {
            notificationService.markAllAsRead(owner);

            verify(notificationRepository).markAllAsReadByReceiver(owner);
        }
    }

    @Nested
    @DisplayName("deleteReadNotifications")
    class DeleteReadNotifications {

        @Test
        @DisplayName("읽은 알림 전체 삭제 쿼리를 호출한다")
        void callsSoftDeleteRead() {
            notificationService.deleteReadNotifications(owner);

            verify(notificationRepository).softDeleteReadByReceiver(owner);
        }
    }

    @Nested
    @DisplayName("deleteNotification")
    class DeleteNotification {

        @Test
        @DisplayName("soft delete 처리한다")
        void softDeletes() {
            Notification notification = buildNotification(1L, false);
            when(notificationRepository.findById(1L)).thenReturn(Optional.of(notification));

            notificationService.deleteNotification(1L, owner);

            assertThat(notification.getIsValid()).isFalse();
        }

        @Test
        @DisplayName("다른 사용자의 알림이면 NO_ACCESS 예외")
        void throwsWhenNotOwner() {
            Notification notification = buildNotification(1L, false);
            when(notificationRepository.findById(1L)).thenReturn(Optional.of(notification));

            assertThatThrownBy(() -> notificationService.deleteNotification(1L, otherUser))
                    .isInstanceOf(CustomException.class)
                    .satisfies(ex -> assertThat(((CustomException) ex).getErrorCode())
                            .isEqualTo(ErrorCode.NO_ACCESS));
        }

        @Test
        @DisplayName("존재하지 않는 알림 ID면 ResourceNotFoundException")
        void throwsWhenNotFound() {
            when(notificationRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> notificationService.deleteNotification(999L, owner))
                    .isInstanceOf(ResourceNotFoundException.class);
        }
    }
}
