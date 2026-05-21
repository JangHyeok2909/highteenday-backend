package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.domain.notification.NotificationFailure;
import com.example.highteenday_backend.enums.NotificationEventType;
import com.example.highteenday_backend.enums.NotificationFailureStatus;
import com.example.highteenday_backend.services.domain.NotificationFailureService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("NotificationRetryScheduler")
class NotificationRetrySchedulerTest {

    @Mock private NotificationFailureService notificationFailureService;

    @InjectMocks private NotificationRetryScheduler scheduler;

    private NotificationFailure buildFailure(Long id) {
        return NotificationFailure.builder()
                .id(id)
                .eventType(NotificationEventType.COMMENT_CREATED)
                .payload("{\"authorId\":1,\"postAuthorId\":2,\"postId\":10,\"content\":\"test\"}")
                .attemptCount(1)
                .maxAttempts(5)
                .status(NotificationFailureStatus.PENDING)
                .nextRetryAt(LocalDateTime.now().minusSeconds(10))
                .build();
    }

    @Nested
    @DisplayName("retryFailedNotifications")
    class RetryFailedNotifications {

        @Test
        @DisplayName("재시도 대상이 없으면 retryOne을 호출하지 않는다")
        void skipsWhenNoFailures() {
            when(notificationFailureService.findRetryable(50)).thenReturn(List.of());

            scheduler.retryFailedNotifications();

            verify(notificationFailureService, never()).retryOne(any());
        }

        @Test
        @DisplayName("재시도 대상 각각에 retryOne을 호출한다")
        void retriesEachFailure() {
            NotificationFailure f1 = buildFailure(1L);
            NotificationFailure f2 = buildFailure(2L);
            when(notificationFailureService.findRetryable(50)).thenReturn(List.of(f1, f2));

            scheduler.retryFailedNotifications();

            verify(notificationFailureService).retryOne(f1);
            verify(notificationFailureService).retryOne(f2);
        }

        @Test
        @DisplayName("개별 retryOne 실패가 나머지 항목 처리를 중단하지 않는다")
        void continuesOnIndividualFailure() {
            NotificationFailure f1 = buildFailure(1L);
            NotificationFailure f2 = buildFailure(2L);
            when(notificationFailureService.findRetryable(50)).thenReturn(List.of(f1, f2));
            doThrow(new RuntimeException("unexpected")).when(notificationFailureService).retryOne(f1);

            scheduler.retryFailedNotifications();

            verify(notificationFailureService).retryOne(f2);
        }
    }
}
