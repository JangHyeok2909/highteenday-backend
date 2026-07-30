package com.example.highteenday_backend.dtos.Chat;

import com.example.highteenday_backend.domain.chat.ChatMsg;
import com.example.highteenday_backend.enums.ChatMsgType;
import lombok.Builder;

import java.time.LocalDateTime;

@Builder
public record ChatMessageDto(
        Long messageId,
        Long roomId,
        Long senderId,
        String senderNickname,
        String senderProfileUrl,
        ChatMsgType type,
        String content,
        String imageUrl,
        String clientMsgId,
        // 이 메시지를 아직 읽지 않은 인원 수. 0이면 표시하지 않는다.
        int unreadCount,
        LocalDateTime createdAt
) {
    public static ChatMessageDto fromEntity(ChatMsg msg) {
        return fromEntity(msg, 0);
    }

    public static ChatMessageDto fromEntity(ChatMsg msg, int unreadCount) {
        return ChatMessageDto.builder()
                .messageId(msg.getId())
                .roomId(msg.getChatRoom().getId())
                .senderId(msg.getSender().getId())
                .senderNickname(msg.getSender().getNicknameValue())
                .senderProfileUrl(msg.getSender().getProfileUrl())
                .type(msg.getType())
                .content(msg.getContent())
                .imageUrl(msg.getImageUrl())
                .clientMsgId(msg.getClientMsgId())
                .unreadCount(unreadCount)
                .createdAt(msg.getCreated())
                .build();
    }
}
