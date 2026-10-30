package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.aop.SchedulerJob;
import com.example.highteenday_backend.domain.notification.NotificationFailure;
import com.example.highteenday_backend.services.domain.NotificationFailureService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@RequiredArgsConstructor
@Component
public class NotificationRetryScheduler {

    private final NotificationFailureService notificationFailureService;

    @Scheduled(fixedDelay = 60_000)
    @SchedulerJob(name = "NotificationRetry")
    public void retryFailedNotifications() {
        List<NotificationFailure> failures = notificationFailureService.findRetryable(50);
        if (failures.isEmpty()) return;

        int resolved = 0;
        for (NotificationFailure failure : failures) {
            try {
                notificationFailureService.retryOne(failure);
                resolved++;
            } catch (Exception e) {
                log.warn("Notification retry unexpected error. failureId={}", failure.getId());
            }
        }
        log.info("Notification retry batch complete. resolved={}, total={}", resolved, failures.size());
    }
}
