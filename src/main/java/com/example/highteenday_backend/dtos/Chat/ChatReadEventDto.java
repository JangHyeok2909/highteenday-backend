package com.example.highteenday_backend.dtos.Chat;

import lombok.Builder;

import java.time.LocalDateTime;

@Builder
public record ChatReadEventDto(
        Long roomId,
        Long userId,
        LocalDateTime readAt
) {
}
