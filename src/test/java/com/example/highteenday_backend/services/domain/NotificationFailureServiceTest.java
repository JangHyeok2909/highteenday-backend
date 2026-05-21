package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.notification.NotificationFailure;
import com.example.highteenday_backend.domain.notification.NotificationFailureRepository;
import com.example.highteenday_backend.enums.NotificationEventType;
import com.example.highteenday_backend.enums.NotificationFailureStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("NotificationFailureService")
class NotificationFailureServiceTest {

    @Mock private NotificationFailureRepository notificationFailureRepository;
    @Mock private NotificationService notificationService;

    private NotificationFailureService notificationFailureService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        notificationFailureService = new NotificationFailureService(
                notificationFailureRepository, notificationService, objectMapper);
    }

    @Nested
    @DisplayName("recordFailure")
    class RecordFailure {

        @Test
        @DisplayName("실패 레코드를 PENDING 상태로 저장한다")
        void savesFailureRecord() {
            String payload = "{\"postId\":10}";
            RuntimeException exception = new RuntimeException("DB error");

            notificationFailureService.recordFailure(
                    NotificationEventType.COMMENT_CREATED, payload, exception);

            ArgumentCaptor<NotificationFailure> captor = ArgumentCaptor.forClass(NotificationFailure.class);
            verify(notificationFailureRepository).save(captor.capture());

            NotificationFailure saved = captor.getValue();
            assertThat(saved.getEventType()).isEqualTo(NotificationEventType.COMMENT_CREATED);
            assertThat(saved.getPayload()).isEqualTo("{\"postId\":10}");
            assertThat(saved.getErrorMessage()).isEqualTo("DB error");
            assertThat(saved.getAttemptCount()).isEqualTo(1);
            assertThat(saved.getMaxAttempts()).isEqualTo(5);
            assertThat(saved.getStatus()).isEqualTo(NotificationFailureStatus.PENDING);
            assertThat(saved.getNextRetryAt()).isNotNull();
        }

        @Test
        @DisplayName("에러 메시지가 500자를 초과하면 잘린다")
        void truncatesLongErrorMessage() {
            String longMessage = "x".repeat(600);
            RuntimeException exception = new RuntimeException(longMessage);

            notificationFailureService.recordFailure(
                    NotificationEventType.COMMENT_CREATED, "{}", exception);

            ArgumentCaptor<NotificationFailure> captor = ArgumentCaptor.forClass(NotificationFailure.class);
            verify(notificationFailureRepository).save(captor.capture());
            assertThat(captor.getValue().getErrorMessage()).hasSize(500);
        }
    }

    @Nested
    @DisplayName("retryOne")
    class RetryOne {

        @Test
        @DisplayName("성공 시 RESOLVED 상태로 전환한다")
        void resolvesOnSuccess() {
            NotificationFailure failure = NotificationFailure.builder()
                    .id(1L)
                    .eventType(NotificationEventType.COMMENT_CREATED)
                    .payload("{\"authorId\":2,\"postAuthorId\":3,\"postId\":10,\"content\":\"댓글\"}")
                    .attemptCount(1)
                    .maxAttempts(5)
                    .status(NotificationFailureStatus.PENDING)
                    .build();

            notificationFailureService.retryOne(failure);

            verify(notificationService).createCommentNotification(2L, 3L, 10L, "댓글");
            assertThat(failure.getStatus()).isEqualTo(NotificationFailureStatus.RESOLVED);
        }

        @Test
        @DisplayName("실패 시 attemptCount를 증가시킨다")
        void incrementsAttemptOnFailure() {
            NotificationFailure failure = NotificationFailure.builder()
                    .id(1L)
                    .eventType(NotificationEventType.FRIEND_REQUEST_SENT)
                    .payload("{\"requesterId\":1,\"receiverId\":2}")
                    .attemptCount(1)
                    .maxAttempts(5)
                    .status(NotificationFailureStatus.PENDING)
                    .build();

            doThrow(new RuntimeException("DB error"))
                    .when(notificationService).createFriendRequestNotification(1L, 2L);

            notificationFailureService.retryOne(failure);

            assertThat(failure.getAttemptCount()).isEqualTo(2);
            assertThat(failure.getStatus()).isEqualTo(NotificationFailureStatus.PENDING);
        }

        @Test
        @DisplayName("maxAttempts 도달 시 FAILED 상태로 전환한다")
        void failsWhenMaxAttemptsReached() {
            NotificationFailure failure = NotificationFailure.builder()
                    .id(1L)
                    .eventType(NotificationEventType.FRIEND_REQUEST_ACCEPTED)
                    .payload("{\"requesterId\":1,\"receiverId\":2}")
                    .attemptCount(4)
                    .maxAttempts(5)
                    .status(NotificationFailureStatus.PENDING)
                    .build();

            doThrow(new RuntimeException("persistent error"))
                    .when(notificationService).createFriendAcceptNotification(1L, 2L);

            notificationFailureService.retryOne(failure);

            assertThat(failure.getAttemptCount()).isEqualTo(5);
            assertThat(failure.getStatus()).isEqualTo(NotificationFailureStatus.FAILED);
        }
    }
}
