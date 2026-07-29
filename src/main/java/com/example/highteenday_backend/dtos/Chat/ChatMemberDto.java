package com.example.highteenday_backend.dtos.Chat;

import com.example.highteenday_backend.domain.chat.ChatParticipants;
import com.example.highteenday_backend.enums.ChatRole;
import lombok.Builder;

@Builder
public record ChatMemberDto(
        Long userId,
        String nickname,
        String profileUrl,
        ChatRole role,
        Long lastReadMsgId
) {
    public static ChatMemberDto fromEntity(ChatParticipants participant) {
        return ChatMemberDto.builder()
                .userId(participant.getUser().getId())
                .nickname(participant.getUser().getNicknameValue())
                .profileUrl(participant.getUser().getProfileUrl())
                .role(participant.getRole())
                .lastReadMsgId(participant.getLastReadMsgId())
                .build();
    }
}
