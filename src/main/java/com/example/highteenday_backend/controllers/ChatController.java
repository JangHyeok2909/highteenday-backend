package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.dtos.Chat.ChatMessageDto;
import com.example.highteenday_backend.dtos.Chat.ChatRoomDto;
import com.example.highteenday_backend.dtos.Chat.CreateChatRoomDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RequestMapping("/api/chat")
@RestController
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @PostMapping("/rooms")
    public ResponseEntity<ChatRoomDto> createOrGetRoom(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestBody CreateChatRoomDto dto
    ) {
        ChatRoomDto room = chatService.getOrCreatePrivateRoom(user.getUser(), dto.friendId());
        return ResponseEntity.ok(room);
    }

    @GetMapping("/rooms")
    public ResponseEntity<List<ChatRoomDto>> getChatRooms(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        List<ChatRoomDto> rooms = chatService.getChatRoomList(user.getUser());
        return ResponseEntity.ok(rooms);
    }

    @GetMapping("/rooms/{roomId}/messages")
    public ResponseEntity<List<ChatMessageDto>> getMessages(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId
    ) {
        List<ChatMessageDto> messages = chatService.getChatMessages(user.getUser(), roomId);
        return ResponseEntity.ok(messages);
    }

    @GetMapping("/rooms/{roomId}/read-status")
    public ResponseEntity<Map<String, Object>> getReadStatus(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId
    ) {
        LocalDateTime otherReadAt = chatService.getOtherReadAt(user.getUser(), roomId);
        return ResponseEntity.ok(Map.of("otherReadAt", otherReadAt != null ? otherReadAt.toString() : ""));
    }

    @PatchMapping("/rooms/{roomId}/read")
    public ResponseEntity<Void> markAsRead(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId
    ) {
        chatService.markAsRead(user.getUser(), roomId);
        return ResponseEntity.ok().build();
    }
}
