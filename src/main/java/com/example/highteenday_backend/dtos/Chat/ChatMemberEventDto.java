package com.example.highteenday_backend.dtos.Chat;

import lombok.Builder;

import java.util.List;

/**
 * 멤버 구성 변경 알림. /topic/chat/room/{roomId}/members 로 발행된다.
 * 클라이언트는 이 이벤트를 받으면 멤버 목록과 미읽음 수 기준선을 갱신한다.
 */
@Builder
public record ChatMemberEventDto(
        Long roomId,
        EventType eventType,
        List<ChatMemberDto> targets,
        // 변경 후 방 인원. 미읽음 수 상한 계산에 쓰인다.
        int memberCount,
        String roomName,
        Long newOwnerId
) {
    public enum EventType {
        JOINED, LEFT, KICKED, ROOM_RENAMED, OWNER_CHANGED, ROLE_CHANGED
    }
}
