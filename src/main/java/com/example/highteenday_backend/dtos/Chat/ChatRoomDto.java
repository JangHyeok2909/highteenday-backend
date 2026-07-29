package com.example.highteenday_backend.dtos.Chat;

import com.example.highteenday_backend.enums.ChatRoomCategory;
import com.example.highteenday_backend.enums.ChatRole;
import lombok.Builder;

import java.time.LocalDateTime;
import java.util.List;

/**
 * PRIVATE / GROUP을 하나의 표현으로 통합한다.
 * roomName은 GROUP이면 사용자가 지정한 이름, PRIVATE이면 서버가 상대방 닉네임으로 채워서 내려준다.
 * 덕분에 프론트는 category 분기 없이 roomName 하나만 렌더하면 된다.
 */
@Builder
public record ChatRoomDto(
        Long roomId,
        String roomName,
        ChatRoomCategory category,
        String lastMessage,
        LocalDateTime lastMessageAt,
        int unreadCount,
        int memberCount,
        ChatRole myRole,
        boolean notificationEnabled,
        // 목록 화면에서는 아바타 표시에 필요한 만큼만(최대 4명) 담는다.
        List<ChatMemberDto> members
) {
}
