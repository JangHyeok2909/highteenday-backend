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

@Controller
@RequiredArgsConstructor
public class ChatWebSocketController {

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat/send")
    public void sendMessage(SendMessageDto dto, Principal principal) {
        UsernamePasswordAuthenticationToken auth = (UsernamePasswordAuthenticationToken) principal;
        CustomUserPrincipal userPrincipal = (CustomUserPrincipal) auth.getPrincipal();

        ChatMessageDto saved = chatService.sendMessage(userPrincipal.getUser(), dto);

        messagingTemplate.convertAndSend("/topic/chat/room/" + dto.roomId(), saved);
    }
}
