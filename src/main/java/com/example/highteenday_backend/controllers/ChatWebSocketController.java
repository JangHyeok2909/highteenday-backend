package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.dtos.Chat.ChatMessageDto;
import com.example.highteenday_backend.dtos.Chat.SendMessageDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * 채팅 메시지 송신 (STOMP).
 *
 * <p>REST가 아니라 Swagger에 잡히지 않으므로 목적지 규약을 여기에 적어둔다.
 * 방/멤버 관리와 조회는 {@link ChatController} 참고.
 *
 * <pre>
 * 발행  /app/chat/send                    SendMessageDto
 * 구독  /topic/chat/room/{roomId}         메시지 (SYSTEM 포함)
 *      /topic/chat/room/{roomId}/read    읽음 위치 이동
 *      /topic/chat/room/{roomId}/members 멤버 변경
 * </pre>
 */
@Controller
@RequiredArgsConstructor
public class ChatWebSocketController {

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * 메시지 전송 — 저장 후 방 토픽으로 브로드캐스트한다.
     *
     * <p>payload는 {@code {roomId, content, imageUrl, clientMsgId}}. 참여자가 아니면 거부된다.
     * {@code clientMsgId}는 클라이언트가 발급한 UUID로, 재연결 후 같은 메시지가 다시 올라와도
     * 한 번만 저장되고 기존 메시지가 그대로 반환된다.
     *
     * <p>전송 시 발신자의 읽음 위치도 함께 전진하므로 자기 메시지의 미읽음 집계에는 포함되지 않는다.
     */
    @MessageMapping("/chat/send")
    public void sendMessage(SendMessageDto dto, Principal principal) {
        UsernamePasswordAuthenticationToken auth = (UsernamePasswordAuthenticationToken) principal;
        CustomUserPrincipal userPrincipal = (CustomUserPrincipal) auth.getPrincipal();

        ChatMessageDto saved = chatService.sendMessage(userPrincipal.getUser(), dto);

        messagingTemplate.convertAndSend("/topic/chat/room/" + dto.roomId(), saved);
    }
}
