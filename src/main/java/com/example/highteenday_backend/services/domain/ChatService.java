package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.chat.*;
import com.example.highteenday_backend.domain.friends.Friend;
import com.example.highteenday_backend.domain.friends.FriendRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.Chat.ChatMessageDto;
import com.example.highteenday_backend.dtos.Chat.ChatReadEventDto;
import com.example.highteenday_backend.dtos.Chat.ChatRoomDto;
import com.example.highteenday_backend.dtos.Chat.SendMessageDto;
import com.example.highteenday_backend.enums.ChatRoomCategory;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

@RequiredArgsConstructor
@Service
public class ChatService {

    private final ChatRoomRepository chatRoomRepository;
    private final ChatMsgRepository chatMsgRepository;
    private final ChatPTRepository chatPTRepository;
    private final UserRepository userRepository;
    private final FriendRepository friendRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public ChatRoomDto getOrCreatePrivateRoom(User me, Long friendId) {
        User friend = userRepository.findById(friendId)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));

        // 친구 관계 검증
        List<Friend> relations = friendRepository.findFriendsRelations(me.getId(), friendId);
        boolean isFriend = relations.stream().anyMatch(Friend::isFriend);
        if (!isFriend) {
            throw new CustomException(ErrorCode.CHAT_NOT_FRIENDS);
        }

        // 기존 1:1 채팅방 검색
        Optional<ChatRoom> existingRoom = chatPTRepository.findPrivateRoomBetween(me, friend);
        if (existingRoom.isPresent()) {
            return buildChatRoomDto(existingRoom.get(), me);
        }

        // 새 채팅방 생성
        String roomName = me.getNicknameValue() + ", " + friend.getNicknameValue();
        ChatRoom chatRoom = ChatRoom.builder()
                .name(roomName)
                .category(ChatRoomCategory.PRIVATE)
                .build();
        chatRoomRepository.save(chatRoom);

        ChatParticipants myParticipant = ChatParticipants.builder()
                .user(me)
                .chatRoom(chatRoom)
                .lastReadDate(LocalDateTime.now())
                .lastReadCount(0)
                .build();

        ChatParticipants friendParticipant = ChatParticipants.builder()
                .user(friend)
                .chatRoom(chatRoom)
                .lastReadDate(LocalDateTime.now())
                .lastReadCount(0)
                .build();

        chatPTRepository.save(myParticipant);
        chatPTRepository.save(friendParticipant);

        return ChatRoomDto.builder()
                .roomId(chatRoom.getId())
                .roomName(chatRoom.getName())
                .lastMessage(null)
                .lastMessageAt(chatRoom.getCreated())
                .unreadCount(0)
                .otherUserId(friend.getId())
                .otherUserNickname(friend.getNicknameValue())
                .otherUserProfileUrl(friend.getProfileUrl())
                .build();
    }

    @Transactional(readOnly = true)
    public List<ChatRoomDto> getChatRoomList(User me) {
        List<ChatParticipants> myParticipations = chatPTRepository.findByUserAndIsValidTrue(me);

        return myParticipations.stream()
                .map(cp -> buildChatRoomDto(cp.getChatRoom(), me))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ChatMessageDto> getChatMessages(User me, Long roomId) {
        ChatRoom chatRoom = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_ROOM_NOT_FOUND));

        chatPTRepository.findByChatRoomAndUser(chatRoom, me)
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_NOT_PARTICIPANT));

        List<ChatMessageDto> messages = new ArrayList<>(chatMsgRepository
                .findTop50ByChatRoomAndIsValidTrueOrderByCreatedDesc(chatRoom)
                .stream()
                .map(ChatMessageDto::fromEntity)
                .toList());

        // 시간순 정렬 (오래된 것부터)
        Collections.reverse(messages);
        return messages;
    }

    @Transactional
    public ChatMessageDto sendMessage(User sender, SendMessageDto dto) {
        ChatRoom chatRoom = chatRoomRepository.findById(dto.roomId())
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_ROOM_NOT_FOUND));

        chatPTRepository.findByChatRoomAndUser(chatRoom, sender)
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_NOT_PARTICIPANT));

        ChatMsg chatMsg = ChatMsg.builder()
                .chatRoom(chatRoom)
                .sender(sender)
                .content(dto.content())
                .imageUrl(dto.imageUrl())
                .build();
        chatMsgRepository.save(chatMsg);

        chatRoom.updateLastMessage(dto.content());

        return ChatMessageDto.fromEntity(chatMsg);
    }

    @Transactional
    public void markAsRead(User me, Long roomId) {
        ChatRoom chatRoom = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_ROOM_NOT_FOUND));

        ChatParticipants participant = chatPTRepository.findByChatRoomAndUser(chatRoom, me)
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_NOT_PARTICIPANT));

        LocalDateTime now = LocalDateTime.now();
        int totalCount = chatMsgRepository.countByChatRoomAndIsValidTrue(chatRoom);
        participant.updateLastRead(now, totalCount);

        ChatReadEventDto readEvent = ChatReadEventDto.builder()
                .roomId(roomId)
                .userId(me.getId())
                .readAt(now)
                .build();
        messagingTemplate.convertAndSend("/topic/chat/room/" + roomId + "/read", readEvent);
    }

    @Transactional(readOnly = true)
    public LocalDateTime getOtherReadAt(User me, Long roomId) {
        ChatRoom chatRoom = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_ROOM_NOT_FOUND));

        chatPTRepository.findByChatRoomAndUser(chatRoom, me)
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_NOT_PARTICIPANT));

        List<ChatParticipants> participants = chatPTRepository.findByChatRoomAndIsValidTrue(chatRoom);
        return participants.stream()
                .filter(cp -> !cp.getUser().getId().equals(me.getId()))
                .map(ChatParticipants::getLastReadDate)
                .findFirst()
                .orElse(null);
    }

    private ChatRoomDto buildChatRoomDto(ChatRoom chatRoom, User me) {
        List<ChatParticipants> participants = chatPTRepository.findByChatRoomAndIsValidTrue(chatRoom);

        // 상대방 찾기
        User otherUser = participants.stream()
                .map(ChatParticipants::getUser)
                .filter(user -> !user.getId().equals(me.getId()))
                .findFirst()
                .orElse(me);

        // 안 읽은 메시지 수 계산
        ChatParticipants myParticipation = participants.stream()
                .filter(cp -> cp.getUser().getId().equals(me.getId()))
                .findFirst()
                .orElse(null);

        int unreadCount = 0;
        if (myParticipation != null && myParticipation.getLastReadDate() != null) {
            unreadCount = chatMsgRepository.countUnreadMessages(chatRoom, myParticipation.getLastReadDate());
        }

        return ChatRoomDto.builder()
                .roomId(chatRoom.getId())
                .roomName(chatRoom.getName())
                .lastMessage(chatRoom.getLastMessage())
                .lastMessageAt(chatRoom.getUpdatedDate() != null ? chatRoom.getUpdatedDate() : chatRoom.getCreated())
                .unreadCount(unreadCount)
                .otherUserId(otherUser.getId())
                .otherUserNickname(otherUser.getNicknameValue())
                .otherUserProfileUrl(otherUser.getProfileUrl())
                .build();
    }
}
