package com.example.highteenday_backend.dtos.Chat;

public record SendMessageDto(
        Long roomId,
        String content,
        String imageUrl,
        // 클라이언트가 발급한 UUID. 재연결 후 재전송돼도 같은 값이면 한 번만 저장된다.
        String clientMsgId
) {
}
