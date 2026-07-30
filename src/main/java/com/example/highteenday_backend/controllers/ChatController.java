package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.dtos.Chat.*;
import com.example.highteenday_backend.enums.ChatRole;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.ChatService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Tag(name = "채팅 API", description = "1:1/단체 채팅방 생성·조회, 메시지 조회, 읽음 처리, 멤버 관리. 메시지 송수신은 WebSocket(STOMP) 담당")
@RequestMapping("/api/chat")
@RestController
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    // ---------------- 방 ----------------

    @Operation(summary = "1:1 채팅방 생성/조회",
            description = "상대와의 방이 이미 있으면 기존 방을 반환한다. 친구 관계여야 하며, pairKey UNIQUE 제약으로 동시 요청 시에도 방이 둘 생기지 않는다.")
    @PostMapping("/rooms")
    public ResponseEntity<ChatRoomDto> createOrGetRoom(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestBody CreateChatRoomDto dto
    ) {
        return ResponseEntity.ok(chatService.getOrCreatePrivateRoom(user.getUser(), dto.friendId()));
    }

    @Operation(summary = "단체 채팅방 생성",
            description = "초대 대상은 모두 친구여야 한다. 정원은 본인 포함 100명. name을 비우면 참여자 닉네임을 이어붙여 30자 이내로 자동 생성한다.")
    @PostMapping("/rooms/group")
    public ResponseEntity<ChatRoomDto> createGroupRoom(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestBody CreateGroupRoomDto dto
    ) {
        return ResponseEntity.ok(chatService.createGroupRoom(user.getUser(), dto));
    }

    @Operation(summary = "내 채팅방 목록",
            description = "1:1과 단체방을 한 번에 반환한다. 1:1 방의 roomName은 서버가 상대 닉네임으로 채워주므로 화면에서 분기할 필요가 없다. members는 아바타용으로 나를 제외한 최대 4명만 담긴다.")
    @GetMapping("/rooms")
    public ResponseEntity<List<ChatRoomDto>> getChatRooms(
            @AuthenticationPrincipal CustomUserPrincipal user
    ) {
        return ResponseEntity.ok(chatService.getChatRoomList(user.getUser()));
    }

    @Operation(summary = "채팅방 상세", description = "참여자만 조회할 수 있다.")
    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<ChatRoomDto> getRoom(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId
    ) {
        return ResponseEntity.ok(chatService.getRoomDetail(user.getUser(), roomId));
    }

    @Operation(summary = "단체방 이름 변경",
            description = "방장/관리자 전용. 1~30자. 변경 시 /topic/chat/room/{roomId}/members로 ROOM_RENAMED 이벤트가 발행된다.")
    @PatchMapping("/rooms/{roomId}")
    public ResponseEntity<ChatRoomDto> updateRoom(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId,
            @RequestBody UpdateChatRoomDto dto
    ) {
        return ResponseEntity.ok(chatService.updateRoomName(user.getUser(), roomId, dto.name()));
    }

    // ---------------- 메시지 ----------------

    @Operation(summary = "메시지 목록 (커서 페이징)",
            description = "cursor를 비우면 최신부터. 위로 스크롤할 때 현재 가진 가장 오래된 messageId를 cursor로 넘긴다. "
                    + "size는 기본이자 최대 50. 응답은 오래된 것부터 정렬되며, 입장 이전 대화는 노출되지 않는다.")
    @GetMapping("/rooms/{roomId}/messages")
    public ResponseEntity<List<ChatMessageDto>> getMessages(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId,
            @RequestParam(required = false) Long cursor,
            @RequestParam(required = false) Integer size
    ) {
        return ResponseEntity.ok(chatService.getChatMessages(user.getUser(), roomId, cursor, size));
    }

    @Operation(summary = "참여자별 읽음 위치",
            description = "각 참여자의 lastReadMsgId를 반환한다. 메시지 M의 미읽음 수 = lastReadMsgId가 M보다 작은 참여자 수. "
                    + "방 진입 시 한 번 받고, 이후에는 /topic/chat/room/{roomId}/read 이벤트로 해당 사용자 항목만 갱신하면 된다.")
    @GetMapping("/rooms/{roomId}/read-status")
    public ResponseEntity<List<ChatMemberDto>> getReadStatus(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId
    ) {
        return ResponseEntity.ok(chatService.getReadStatus(user.getUser(), roomId));
    }

    @Operation(summary = "읽음 처리",
            description = "내 읽음 위치를 lastMsgId까지 전진시킨다. lastMsgId를 비우면 방의 마지막 메시지 기준. "
                    + "읽음 위치는 단조 증가하며, 실제로 전진했을 때만 read 이벤트를 발행해 대형 방의 브로드캐스트 증폭을 막는다.")
    @PatchMapping("/rooms/{roomId}/read")
    public ResponseEntity<Void> markAsRead(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId,
            @RequestParam(required = false) Long lastMsgId
    ) {
        chatService.markAsRead(user.getUser(), roomId, lastMsgId);
        return ResponseEntity.ok().build();
    }

    // ---------------- 멤버 ----------------

    @Operation(summary = "멤버 목록",
            description = "방 목록의 미리보기(최대 4명)와 달리 전체 참여자를 역할·읽음 위치와 함께 반환한다.")
    @GetMapping("/rooms/{roomId}/members")
    public ResponseEntity<List<ChatMemberDto>> getMembers(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId
    ) {
        return ResponseEntity.ok(chatService.getMembers(user.getUser(), roomId));
    }

    @Operation(summary = "멤버 초대",
            description = "방장/관리자 전용. 초대자와 대상이 친구여야 하며 정원 100명을 넘길 수 없다. "
                    + "신규 멤버는 입장 시점 이전 대화를 볼 수 없고, 기존 메시지의 미읽음 수에도 잡히지 않는다.")
    @PostMapping("/rooms/{roomId}/members")
    public ResponseEntity<List<ChatMemberDto>> inviteMembers(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId,
            @RequestBody InviteMembersDto dto
    ) {
        return ResponseEntity.ok(chatService.inviteMembers(user.getUser(), roomId, dto.memberIds()));
    }

    @Operation(summary = "채팅방 나가기",
            description = "참여자 누구나 가능. 방장이 나가면 관리자 우선, 없으면 가장 오래된 멤버에게 방장이 자동 위임된다. 마지막 1명이 나가면 방이 닫힌다.")
    @DeleteMapping("/rooms/{roomId}/members/me")
    public ResponseEntity<Void> leaveRoom(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId
    ) {
        chatService.leaveRoom(user.getUser(), roomId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "멤버 강퇴",
            description = "방장/관리자 전용. 방장은 강퇴할 수 없고, 자기 자신은 나가기를 써야 한다.")
    @DeleteMapping("/rooms/{roomId}/members/{userId}")
    public ResponseEntity<Void> kickMember(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId,
            @PathVariable Long userId
    ) {
        chatService.kickMember(user.getUser(), roomId, userId);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "관리자 임명/해제",
            description = "방장 전용. body의 role은 ADMIN 또는 MEMBER. 방장 자리 양도는 지원하지 않는다.")
    @PatchMapping("/rooms/{roomId}/members/{userId}/role")
    public ResponseEntity<Void> changeRole(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId,
            @PathVariable Long userId,
            @RequestBody Map<String, String> body
    ) {
        chatService.changeRole(user.getUser(), roomId, userId,
                ChatRole.valueOf(body.get("role")));
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "방별 알림 on/off", description = "참여자 본인의 해당 방 알림 수신 여부를 변경한다.")
    @PatchMapping("/rooms/{roomId}/notification")
    public ResponseEntity<Void> updateNotification(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @PathVariable Long roomId,
            @RequestParam boolean enabled
    ) {
        chatService.updateNotification(user.getUser(), roomId, enabled);
        return ResponseEntity.ok().build();
    }
}
