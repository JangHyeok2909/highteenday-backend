package com.example.highteenday_backend.dtos.Chat;

public record SendMessageDto(
        Long roomId,
        String content,
        String imageUrl
) {
}
