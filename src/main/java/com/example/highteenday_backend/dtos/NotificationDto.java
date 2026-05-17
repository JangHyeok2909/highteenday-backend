package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.notification.Notification;
import com.example.highteenday_backend.enums.EntityType;
import com.example.highteenday_backend.enums.NotificationCategory;
import lombok.Builder;

import java.time.LocalDateTime;

@Builder
public record NotificationDto(
        Long id,
        NotificationCategory category,
        EntityType entityType,
        Long entityId,
        String senderNickname,
        String senderProfileUrl,
        String message,
        String contentMessage,
        boolean isRead,
        LocalDateTime createdAt
) {
    public static NotificationDto fromEntity(Notification n) {
        return NotificationDto.builder()
                .id(n.getId())
                .category(n.getCategory())
                .entityType(n.getEntityType())
                .entityId(n.getEntityId())
                .senderNickname(n.getSender() != null ? n.getSender().getNickname() : null)
                .senderProfileUrl(n.getSender() != null ? n.getSender().getProfileUrl() : null)
                .message(n.getMessage())
                .contentMessage(n.getContentMessage())
                .isRead(Boolean.TRUE.equals(n.getIsRead()))
                .createdAt(n.getCreated())
                .build();
    }
}
