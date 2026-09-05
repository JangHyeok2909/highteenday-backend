package com.example.highteenday_backend.domain.notification;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.enums.NotificationEventType;
import com.example.highteenday_backend.enums.NotificationFailureStatus;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name = "notification_failures", indexes = {
        @Index(name = "idx_ntf_status_retry", columnList = "NTF_status, NTF_next_retry_at")
})
@Entity
public class NotificationFailure extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "NTF_id")
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "NTF_event_type", nullable = false, length = 50)
    private NotificationEventType eventType;

    @Column(name = "NTF_payload", nullable = false, columnDefinition = "TEXT")
    private String payload;

    @Column(name = "NTF_error_msg", length = 500)
    private String errorMessage;

    @Builder.Default
    @Column(name = "NTF_attempt_count", nullable = false)
    private Integer attemptCount = 0;

    @Builder.Default
    @Column(name = "NTF_max_attempts", nullable = false)
    private Integer maxAttempts = 5;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "NTF_status", nullable = false, length = 20)
    private NotificationFailureStatus status = NotificationFailureStatus.PENDING;

    @Column(name = "NTF_next_retry_at", nullable = false)
    private LocalDateTime nextRetryAt;

    public void incrementAttempt(String errorMessage) {
        this.attemptCount++;
        this.errorMessage = errorMessage;
        this.nextRetryAt = LocalDateTime.now().plusSeconds(60);
        if (this.attemptCount >= this.maxAttempts) {
            this.status = NotificationFailureStatus.FAILED;
        }
    }

    public void resolve() {
        this.status = NotificationFailureStatus.RESOLVED;
    }
}
