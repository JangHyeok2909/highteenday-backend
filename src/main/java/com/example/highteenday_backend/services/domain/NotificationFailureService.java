package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.notification.NotificationFailure;
import com.example.highteenday_backend.domain.notification.NotificationFailureRepository;
import com.example.highteenday_backend.enums.NotificationEventType;
import com.example.highteenday_backend.enums.NotificationFailureStatus;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@RequiredArgsConstructor
@Service
public class NotificationFailureService {

    private final NotificationFailureRepository notificationFailureRepository;
    private final NotificationService notificationService;
    private final ObjectMapper objectMapper;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(NotificationEventType eventType, String payload, Throwable throwable) {
        String errorMsg = throwable.getMessage();
        if (errorMsg != null && errorMsg.length() > 500) {
            errorMsg = errorMsg.substring(0, 500);
        }

        notificationFailureRepository.save(
                NotificationFailure.builder()
                        .eventType(eventType)
                        .payload(payload)
                        .errorMessage(errorMsg)
                        .attemptCount(1)
                        .maxAttempts(5)
                        .status(NotificationFailureStatus.PENDING)
                        .nextRetryAt(LocalDateTime.now().plusSeconds(60))
                        .build()
        );
    }

    @Transactional(readOnly = true)
    public List<NotificationFailure> findRetryable(int limit) {
        return notificationFailureRepository.findRetryable(LocalDateTime.now(), PageRequest.of(0, limit));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void retryOne(NotificationFailure failure) {
        try {
            Map<String, Object> payload = fromJson(failure.getPayload());
            dispatchNotification(failure.getEventType(), payload);
            failure.resolve();
        } catch (Exception e) {
            failure.incrementAttempt(truncate(e.getMessage(), 500));
            if (failure.getStatus() == NotificationFailureStatus.FAILED) {
                log.warn("Notification retry exhausted. failureId={}, eventType={}",
                        failure.getId(), failure.getEventType());
            }
        }
    }

    private void dispatchNotification(NotificationEventType eventType, Map<String, Object> payload) {
        switch (eventType) {
            case COMMENT_CREATED -> notificationService.createCommentNotification(
                    toLong(payload.get("authorId")),
                    toLong(payload.get("postAuthorId")),
                    toLong(payload.get("postId")),
                    (String) payload.get("content")
            );
            case FRIEND_REQUEST_SENT -> notificationService.createFriendRequestNotification(
                    toLong(payload.get("requesterId")),
                    toLong(payload.get("receiverId"))
            );
            case FRIEND_REQUEST_ACCEPTED -> notificationService.createFriendAcceptNotification(
                    toLong(payload.get("requesterId")),
                    toLong(payload.get("receiverId"))
            );
        }
    }

    private Map<String, Object> fromJson(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to deserialize notification payload", e);
        }
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.valueOf(value.toString());
    }

    private String truncate(String str, int maxLength) {
        if (str == null) return null;
        return str.length() > maxLength ? str.substring(0, maxLength) : str;
    }
}
