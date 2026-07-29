package com.example.highteenday_backend.dtos.Chat;

import lombok.Builder;

import java.time.LocalDateTime;

/**
 * 읽음 위치 이동 알림.
 * 단체방에서는 수신자가 "누가 어디까지 읽었는지"를 알아야 메시지별 미읽음 수를 다시 계산할 수 있으므로
 * 타임스탬프가 아니라 lastReadMsgId를 싣는다.
 */
@Builder
public record ChatReadEventDto(
        Long roomId,
        Long userId,
        Long lastReadMsgId,
        LocalDateTime readAt
) {
}
