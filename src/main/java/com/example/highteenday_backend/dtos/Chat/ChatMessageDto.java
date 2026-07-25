package com.example.highteenday_backend.dtos.Chat;

import com.example.highteenday_backend.domain.chat.ChatMsg;
import lombok.Builder;

import java.time.LocalDateTime;

@Builder
public record ChatMessageDto(
        Long messageId,
        Long roomId,
        Long senderId,
        String senderNickname,
        String senderProfileUrl,
        String content,
        String imageUrl,
        LocalDateTime createdAt
) {
    public static ChatMessageDto fromEntity(ChatMsg msg) {
        return ChatMessageDto.builder()
                .messageId(msg.getId())
                .roomId(msg.getChatRoom().getId())
                .senderId(msg.getSender().getId())
                .senderNickname(msg.getSender().getNicknameValue())
                .senderProfileUrl(msg.getSender().getProfileUrl())
                .content(msg.getContent())
                .imageUrl(msg.getImageUrl())
                .createdAt(msg.getCreated())
                .build();
    }
}
