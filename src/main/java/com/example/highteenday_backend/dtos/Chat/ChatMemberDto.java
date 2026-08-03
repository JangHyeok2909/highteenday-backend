package com.example.highteenday_backend.dtos.Chat;

import com.example.highteenday_backend.domain.chat.ChatParticipants;
import com.example.highteenday_backend.enums.ChatRole;
import com.example.highteenday_backend.enums.RelationStatus;
import lombok.Builder;

@Builder
public record ChatMemberDto(
        Long userId,
        String nickname,
        String profileUrl,
        ChatRole role,
        Long lastReadMsgId,
        // 열람자 기준의 관계. 수신자가 여럿인 브로드캐스트에서는 "누구 기준인지"를 정할 수 없으므로
        // 목록 조회에서만 채우고 그 외에는 null이다. 클라이언트는 멤버 이벤트를 받으면
        // 목록을 다시 불러오므로 브로드캐스트에 관계를 실을 이유가 없다.
        RelationStatus relation
) {
    public static ChatMemberDto fromEntity(ChatParticipants participant) {
        return fromEntity(participant, null);
    }

    public static ChatMemberDto fromEntity(ChatParticipants participant, RelationStatus relation) {
        return ChatMemberDto.builder()
                .userId(participant.getUser().getId())
                .nickname(participant.getUser().getNicknameValue())
                .profileUrl(participant.getUser().getProfileUrl())
                .role(participant.getRole())
                .lastReadMsgId(participant.getLastReadMsgId())
                .relation(relation)
                .build();
    }
}
