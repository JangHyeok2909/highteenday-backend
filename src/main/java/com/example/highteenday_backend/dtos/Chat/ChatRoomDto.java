package com.example.highteenday_backend.dtos.Chat;

import lombok.Builder;

import java.time.LocalDateTime;

@Builder
public record ChatRoomDto(
        Long roomId,
        String roomName,
        String lastMessage,
        LocalDateTime lastMessageAt,
        int unreadCount,
        Long otherUserId,
        String otherUserNickname,
        String otherUserProfileUrl
) {
}
