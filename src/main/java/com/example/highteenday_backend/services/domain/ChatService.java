package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.chat.*;
import com.example.highteenday_backend.domain.friends.FriendRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.Chat.*;
import com.example.highteenday_backend.enums.ChatMsgType;
import com.example.highteenday_backend.enums.ChatRole;
import com.example.highteenday_backend.enums.ChatRoomCategory;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.RelationStatus;
import com.example.highteenday_backend.exceptions.CustomException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import com.example.highteenday_backend.services.global.AfterCommitExecutor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RequiredArgsConstructor
@Service
public class ChatService {

    private static final int MAX_MEMBERS = 100;
    private static final int MAX_ROOM_NAME_LENGTH = 30;
    private static final int DEFAULT_PAGE_SIZE = 50;
    /** 방 목록에서 아바타로 보여줄 최대 인원 */
    private static final int ROOM_LIST_MEMBER_PREVIEW = 4;

    private final ChatRoomRepository chatRoomRepository;
    private final ChatMsgRepository chatMsgRepository;
    private final ChatPTRepository chatPTRepository;
    private final UserRepository userRepository;
    private final FriendRepository friendRepository;
    private final FriendService friendService;
    private final SimpMessagingTemplate messagingTemplate;
    private final AfterCommitExecutor afterCommitExecutor;

    // ------------------------------------------------------------------
    // 방 생성
    // ------------------------------------------------------------------

    @Transactional
    public ChatRoomDto getOrCreatePrivateRoom(User me, Long friendId) {
        User friend = userRepository.findById(friendId)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));

        requireFriendship(me, List.of(friendId));

        String pairKey = ChatRoom.pairKeyOf(me.getId(), friend.getId());

        Optional<ChatRoom> existing = chatRoomRepository.findByPairKey(pairKey);
        if (existing.isPresent()) {
            ChatRoom room = existing.get();
            // 한쪽이 나갔다가 다시 대화를 거는 경우 참여자 행을 되살린다.
            restoreParticipantIfLeft(room, me);
            restoreParticipantIfLeft(room, friend);
            return buildRoomDto(room, me, chatPTRepository.findActiveMembers(room), 0);
        }

        ChatRoom chatRoom = ChatRoom.builder()
                .category(ChatRoomCategory.PRIVATE)
                .pairKey(pairKey)
                .build();
        try {
            chatRoomRepository.saveAndFlush(chatRoom);
        } catch (DataIntegrityViolationException e) {
            // 동시 요청이 겹쳐 UNIQUE 제약에 걸린 경우, 먼저 만들어진 방을 쓴다.
            ChatRoom winner = chatRoomRepository.findByPairKey(pairKey)
                    .orElseThrow(() -> new CustomException(ErrorCode.CHAT_ROOM_NOT_FOUND));
            return buildRoomDto(winner, me, chatPTRepository.findActiveMembers(winner), 0);
        }

        LocalDateTime now = LocalDateTime.now();
        chatPTRepository.save(newParticipant(chatRoom, me, ChatRole.MEMBER, now, 0L));
        chatPTRepository.save(newParticipant(chatRoom, friend, ChatRole.MEMBER, now, 0L));

        return buildRoomDto(chatRoom, me, chatPTRepository.findActiveMembers(chatRoom), 0);
    }

    @Transactional
    public ChatRoomDto createGroupRoom(User me, CreateGroupRoomDto dto) {
        List<Long> memberIds = distinctIdsExcluding(dto.memberIds(), me.getId());
        if (memberIds.isEmpty()) {
            throw new CustomException(ErrorCode.CHAT_INVALID_MEMBER_COUNT);
        }
        if (memberIds.size() + 1 > MAX_MEMBERS) {
            throw new CustomException(ErrorCode.CHAT_ROOM_FULL);
        }
        requireFriendship(me, memberIds);

        List<User> members = userRepository.findAllById(memberIds);
        if (members.size() != memberIds.size()) {
            throw new CustomException(ErrorCode.USER_NOT_FOUND);
        }

        String name = normalizeRoomName(dto.name(), me, members);

        ChatRoom chatRoom = ChatRoom.builder()
                .name(name)
                .category(ChatRoomCategory.GROUP)
                .owner(me)
                .build();
        chatRoomRepository.save(chatRoom);

        LocalDateTime now = LocalDateTime.now();
        chatPTRepository.save(newParticipant(chatRoom, me, ChatRole.OWNER, now, 0L));
        for (User member : members) {
            chatPTRepository.save(newParticipant(chatRoom, member, ChatRole.MEMBER, now, 0L));
        }

        writeSystemMessage(chatRoom, me, me.getNicknameValue() + "님이 채팅방을 만들었습니다.");

        return buildRoomDto(chatRoom, me, chatPTRepository.findActiveMembers(chatRoom), 0);
    }

    // ------------------------------------------------------------------
    // 조회
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<ChatRoomDto> getChatRoomList(User me) {
        List<ChatParticipants> myParticipations = chatPTRepository.findMyRooms(me);
        if (myParticipations.isEmpty()) return List.of();

        List<Long> roomIds = myParticipations.stream()
                .map(p -> p.getChatRoom().getId())
                .toList();

        // 안읽음 수는 방 개수와 무관하게 쿼리 한 번으로 가져온다.
        Map<Long, Integer> unreadByRoom = chatMsgRepository.countUnreadByUserId(me.getId()).stream()
                .collect(Collectors.toMap(
                        ChatMsgRepository.UnreadCountProjection::getRoomId,
                        p -> p.getUnreadCount() == null ? 0 : p.getUnreadCount().intValue()));

        Map<Long, List<ChatParticipants>> membersByRoom =
                chatPTRepository.findActiveMembersByRoomIds(roomIds).stream()
                        .collect(Collectors.groupingBy(p -> p.getChatRoom().getId()));

        return myParticipations.stream()
                .map(p -> {
                    ChatRoom room = p.getChatRoom();
                    List<ChatParticipants> members =
                            membersByRoom.getOrDefault(room.getId(), List.of());
                    return buildRoomDto(room, me, members,
                            unreadByRoom.getOrDefault(room.getId(), 0));
                })
                .sorted(Comparator.comparing(
                        ChatRoomDto::lastMessageAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    @Transactional(readOnly = true)
    public ChatRoomDto getRoomDetail(User me, Long roomId) {
        ChatRoom room = findRoom(roomId);
        requireParticipant(room, me);
        List<ChatParticipants> members = chatPTRepository.findActiveMembers(room);
        int unread = chatMsgRepository.countUnreadByUserId(me.getId()).stream()
                .filter(p -> Objects.equals(p.getRoomId(), roomId))
                .findFirst()
                .map(p -> p.getUnreadCount() == null ? 0 : p.getUnreadCount().intValue())
                .orElse(0);
        return buildRoomDto(room, me, members, unread);
    }

    @Transactional(readOnly = true)
    public List<ChatMemberDto> getMembers(User me, Long roomId) {
        ChatRoom room = findRoom(roomId);
        requireParticipant(room, me);
        return withRelations(me, chatPTRepository.findActiveMembers(room));
    }

    /** 멤버마다 열람자와의 관계를 붙인다. 관계 조회는 인원 수와 무관하게 세 번의 쿼리로 끝난다. */
    private List<ChatMemberDto> withRelations(User me, List<ChatParticipants> members) {
        List<Long> memberIds = members.stream().map(p -> p.getUser().getId()).toList();
        Map<Long, RelationStatus> relations = friendService.getRelations(me.getId(), memberIds);
        return members.stream()
                .map(p -> ChatMemberDto.fromEntity(p, relations.get(p.getUser().getId())))
                .toList();
    }

    /**
     * 커서 페이징. cursor가 null이면 최신 메시지부터.
     * 반환은 항상 오래된 것 -> 최신 순이며, 메시지마다 아직 읽지 않은 인원 수가 채워진다.
     */
    @Transactional(readOnly = true)
    public List<ChatMessageDto> getChatMessages(User me, Long roomId, Long cursor, Integer size) {
        ChatRoom room = findRoom(roomId);
        ChatParticipants myParticipation = requireParticipant(room, me);

        long effectiveCursor = (cursor == null) ? Long.MAX_VALUE : cursor;
        long floor = myParticipation.getJoinedMsgId() == null ? 0L : myParticipation.getJoinedMsgId();
        int limit = (size == null || size <= 0 || size > DEFAULT_PAGE_SIZE) ? DEFAULT_PAGE_SIZE : size;

        List<ChatMsg> messages = chatMsgRepository.findByRoomIdWithCursor(
                roomId, effectiveCursor, floor, PageRequest.of(0, limit));

        long[] readPositions = readPositionsOf(chatPTRepository.findActiveMembers(room));

        List<ChatMessageDto> result = messages.stream()
                .map(m -> ChatMessageDto.fromEntity(m, unreadCountOf(m, readPositions)))
                .collect(Collectors.toCollection(ArrayList::new));
        Collections.reverse(result); // 오래된 것부터
        return result;
    }

    /** 단체방에서는 "누가 어디까지 읽었는지"가 모두 필요하므로 멤버 전체의 읽음 위치를 내려준다. */
    @Transactional(readOnly = true)
    public List<ChatMemberDto> getReadStatus(User me, Long roomId) {
        ChatRoom room = findRoom(roomId);
        requireParticipant(room, me);
        return withRelations(me, chatPTRepository.findActiveMembers(room));
    }

    // ------------------------------------------------------------------
    // 메시지
    // ------------------------------------------------------------------

    @Transactional
    public ChatMessageDto sendMessage(User sender, SendMessageDto dto) {
        ChatRoom chatRoom = findRoom(dto.roomId());
        requireParticipant(chatRoom, sender);

        boolean hasText = dto.content() != null && !dto.content().isBlank();
        boolean hasImage = dto.imageUrl() != null && !dto.imageUrl().isBlank();
        if (!hasText && !hasImage) {
            throw new CustomException(ErrorCode.CHAT_EMPTY_MESSAGE);
        }

        // 재연결 후 같은 메시지가 다시 올라오면 저장하지 않고 원본을 돌려준다.
        if (dto.clientMsgId() != null) {
            Optional<ChatMsg> duplicate =
                    chatMsgRepository.findByChatRoomIdAndClientMsgId(chatRoom.getId(), dto.clientMsgId());
            if (duplicate.isPresent()) {
                return ChatMessageDto.fromEntity(duplicate.get(), 0);
            }
        }

        ChatMsg chatMsg = ChatMsg.builder()
                .chatRoom(chatRoom)
                .sender(sender)
                .type(hasText ? ChatMsgType.TEXT : ChatMsgType.IMAGE)
                .content(dto.content())
                .imageUrl(dto.imageUrl())
                .clientMsgId(dto.clientMsgId())
                .build();
        try {
            chatMsgRepository.saveAndFlush(chatMsg);
        } catch (DataIntegrityViolationException e) {
            // UNIQUE(room, clientMsgId) 충돌 = 동시 재전송. 먼저 저장된 쪽을 반환한다.
            ChatMsg winner = chatMsgRepository
                    .findByChatRoomIdAndClientMsgId(chatRoom.getId(), dto.clientMsgId())
                    .orElseThrow(() -> new CustomException(ErrorCode.DATA_INTEGRITY_ERROR));
            return ChatMessageDto.fromEntity(winner, 0);
        }

        chatRoom.updateLastMessage(previewOf(hasText ? dto.content() : null, hasImage));

        // 보낸 사람의 읽음 위치도 함께 전진시킨다.
        // 이렇게 해두면 미읽음 집계에서 발신자를 따로 제외하는 분기가 필요 없다.
        chatPTRepository.findByChatRoomAndUser(chatRoom, sender)
                .ifPresent(p -> p.updateLastReadMsgId(chatMsg.getId()));

        int unread = unreadCountOf(chatMsg, readPositionsOf(chatPTRepository.findActiveMembers(chatRoom)));
        return ChatMessageDto.fromEntity(chatMsg, unread);
    }

    /** lastMsgId가 null이면 방의 최신 메시지까지 읽은 것으로 처리한다. */
    @Transactional
    public void markAsRead(User me, Long roomId, Long lastMsgId) {
        ChatRoom room = findRoom(roomId);
        ChatParticipants participant = requireParticipant(room, me);

        Long target = (lastMsgId != null) ? lastMsgId : chatMsgRepository.findLastMsgIdByRoomId(roomId);
        Long before = participant.getLastReadMsgId();
        participant.updateLastReadMsgId(target);

        // 위치가 실제로 전진했을 때만 브로드캐스트한다.
        // 단체방에서 모두가 읽을 때마다 발행하면 인원수의 제곱으로 증폭되기 때문이다.
        boolean advanced = !Objects.equals(before, participant.getLastReadMsgId());
        if (!advanced) return;

        ChatReadEventDto readEvent = ChatReadEventDto.builder()
                .roomId(roomId)
                .userId(me.getId())
                .lastReadMsgId(participant.getLastReadMsgId())
                .readAt(participant.getLastReadDate())
                .build();
        // 커밋 이후에 발행한다. 커밋 전에 보내면 롤백 시 클라이언트만 "읽음"으로 앞서 가고
        // DB 의 읽음 위치는 그대로인 유령 이벤트가 남는다 (docs/KNOWN-ISSUES.md KI-24).
        afterCommitExecutor.run(() ->
                messagingTemplate.convertAndSend("/topic/chat/room/" + roomId + "/read", readEvent));
    }

    // ------------------------------------------------------------------
    // 멤버 관리
    // ------------------------------------------------------------------

    @Transactional
    public List<ChatMemberDto> inviteMembers(User me, Long roomId, List<Long> rawMemberIds) {
        ChatRoom room = findRoom(roomId);
        ChatParticipants myParticipation = requireParticipant(room, me);
        requireGroupRoom(room);
        requireManagePermission(myParticipation);

        List<Long> memberIds = distinctIdsExcluding(rawMemberIds, me.getId());
        if (memberIds.isEmpty()) {
            throw new CustomException(ErrorCode.CHAT_INVALID_MEMBER_COUNT);
        }
        requireFriendship(me, memberIds);

        int currentCount = chatPTRepository.countByChatRoomAndIsValidTrue(room);
        List<ChatParticipants> existing = chatPTRepository.findByChatRoomAndUserIds(room, memberIds);
        Map<Long, ChatParticipants> existingByUserId = existing.stream()
                .collect(Collectors.toMap(p -> p.getUser().getId(), p -> p));

        boolean allAlreadyIn = memberIds.stream().allMatch(id -> {
            ChatParticipants p = existingByUserId.get(id);
            return p != null && Boolean.TRUE.equals(p.getIsValid());
        });
        if (allAlreadyIn) {
            throw new CustomException(ErrorCode.CHAT_ALREADY_PARTICIPANT);
        }

        List<User> users = userRepository.findAllById(memberIds);
        if (users.size() != memberIds.size()) {
            throw new CustomException(ErrorCode.USER_NOT_FOUND);
        }

        LocalDateTime now = LocalDateTime.now();
        Long lastMsgId = chatMsgRepository.findLastMsgIdByRoomId(roomId);
        List<ChatParticipants> joined = new ArrayList<>();

        for (User user : users) {
            ChatParticipants prev = existingByUserId.get(user.getId());
            if (prev != null && Boolean.TRUE.equals(prev.getIsValid())) continue;

            if (currentCount + joined.size() + 1 > MAX_MEMBERS) {
                throw new CustomException(ErrorCode.CHAT_ROOM_FULL);
            }

            if (prev != null) {
                prev.rejoin(now, lastMsgId);
                joined.add(prev);
            } else {
                joined.add(chatPTRepository.save(
                        newParticipant(room, user, ChatRole.MEMBER, now, lastMsgId)));
            }
        }

        String names = joined.stream()
                .map(p -> p.getUser().getNicknameValue())
                .collect(Collectors.joining(", "));
        writeSystemMessage(room, me, names + "님이 들어왔습니다.");

        List<ChatMemberDto> joinedDtos = joined.stream().map(ChatMemberDto::fromEntity).toList();
        publishMemberEvent(room, ChatMemberEventDto.EventType.JOINED, joinedDtos, null);
        return joinedDtos;
    }

    @Transactional
    public void leaveRoom(User me, Long roomId) {
        ChatRoom room = findRoom(roomId);
        ChatParticipants participant = requireParticipant(room, me);

        participant.delete();
        writeSystemMessage(room, me, me.getNicknameValue() + "님이 나갔습니다.");

        List<ChatParticipants> remaining = chatPTRepository.findActiveMembers(room);
        if (remaining.isEmpty()) {
            // 마지막 참여자가 나가면 방도 닫는다.
            room.delete();
            return;
        }

        Long newOwnerId = null;
        if (participant.getRole() == ChatRole.OWNER) {
            // 관리자 우선, 없으면 가장 오래된 멤버에게 방장을 넘긴다.
            ChatParticipants successor = remaining.stream()
                    .filter(p -> p.getRole() == ChatRole.ADMIN)
                    .findFirst()
                    .orElse(remaining.get(0));
            successor.changeRole(ChatRole.OWNER);
            room.changeOwner(successor.getUser());
            newOwnerId = successor.getUser().getId();
            writeSystemMessage(room, successor.getUser(),
                    successor.getUser().getNicknameValue() + "님이 새로운 방장이 되었습니다.");
        }

        publishMemberEvent(room, ChatMemberEventDto.EventType.LEFT,
                List.of(ChatMemberDto.fromEntity(participant)), newOwnerId);
    }

    @Transactional
    public void kickMember(User me, Long roomId, Long targetUserId) {
        ChatRoom room = findRoom(roomId);
        ChatParticipants myParticipation = requireParticipant(room, me);
        requireGroupRoom(room);
        requireManagePermission(myParticipation);

        if (Objects.equals(me.getId(), targetUserId)) {
            throw new CustomException(ErrorCode.CHAT_CANNOT_KICK_SELF);
        }

        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        ChatParticipants targetParticipation = chatPTRepository.findByChatRoomAndUser(room, target)
                .filter(p -> Boolean.TRUE.equals(p.getIsValid()))
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_NOT_PARTICIPANT));

        if (targetParticipation.getRole() == ChatRole.OWNER) {
            throw new CustomException(ErrorCode.CHAT_CANNOT_KICK_OWNER);
        }
        // 관리자끼리는 서로 내보낼 수 없다. 방장만 관리자를 내보낼 수 있다.
        if (targetParticipation.getRole() == ChatRole.ADMIN
                && myParticipation.getRole() != ChatRole.OWNER) {
            throw new CustomException(ErrorCode.CHAT_NO_PERMISSION);
        }

        targetParticipation.delete();
        writeSystemMessage(room, me, target.getNicknameValue() + "님이 내보내졌습니다.");
        publishMemberEvent(room, ChatMemberEventDto.EventType.KICKED,
                List.of(ChatMemberDto.fromEntity(targetParticipation)), null);
    }

    @Transactional
    public ChatRoomDto updateRoomName(User me, Long roomId, String rawName) {
        ChatRoom room = findRoom(roomId);
        ChatParticipants myParticipation = requireParticipant(room, me);
        requireGroupRoom(room);
        requireManagePermission(myParticipation);

        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty() || name.length() > MAX_ROOM_NAME_LENGTH) {
            throw new CustomException(ErrorCode.CHAT_INVALID_ROOM_NAME);
        }

        room.updateName(name);
        writeSystemMessage(room, me, "채팅방 이름이 '" + name + "'(으)로 변경되었습니다.");
        publishMemberEvent(room, ChatMemberEventDto.EventType.ROOM_RENAMED, List.of(), null);

        return buildRoomDto(room, me, chatPTRepository.findActiveMembers(room), 0);
    }

    @Transactional
    public void changeRole(User me, Long roomId, Long targetUserId, ChatRole newRole) {
        ChatRoom room = findRoom(roomId);
        ChatParticipants myParticipation = requireParticipant(room, me);
        requireGroupRoom(room);

        // 권한 변경은 방장만 할 수 있고, 방장 자리를 직접 넘기는 것은 여기서 다루지 않는다.
        if (myParticipation.getRole() != ChatRole.OWNER) {
            throw new CustomException(ErrorCode.CHAT_NO_PERMISSION);
        }
        if (newRole == ChatRole.OWNER || Objects.equals(me.getId(), targetUserId)) {
            throw new CustomException(ErrorCode.CHAT_NO_PERMISSION);
        }

        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));
        ChatParticipants targetParticipation = chatPTRepository.findByChatRoomAndUser(room, target)
                .filter(p -> Boolean.TRUE.equals(p.getIsValid()))
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_NOT_PARTICIPANT));

        targetParticipation.changeRole(newRole);
        publishMemberEvent(room, ChatMemberEventDto.EventType.ROLE_CHANGED,
                List.of(ChatMemberDto.fromEntity(targetParticipation)), null);
    }

    @Transactional
    public void updateNotification(User me, Long roomId, boolean enabled) {
        ChatRoom room = findRoom(roomId);
        ChatParticipants participant = requireParticipant(room, me);
        participant.updateNotification(enabled);
    }

    // ------------------------------------------------------------------
    // 내부 헬퍼
    // ------------------------------------------------------------------

    private ChatRoom findRoom(Long roomId) {
        return chatRoomRepository.findById(roomId)
                .filter(r -> Boolean.TRUE.equals(r.getIsValid()))
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_ROOM_NOT_FOUND));
    }

    private ChatParticipants requireParticipant(ChatRoom room, User user) {
        return chatPTRepository.findByChatRoomAndUser(room, user)
                .filter(p -> Boolean.TRUE.equals(p.getIsValid()))
                .orElseThrow(() -> new CustomException(ErrorCode.CHAT_NOT_PARTICIPANT));
    }

    private void requireGroupRoom(ChatRoom room) {
        if (!room.getCategory().isMultiParty()) {
            throw new CustomException(ErrorCode.CHAT_NOT_GROUP_ROOM);
        }
    }

    private void requireManagePermission(ChatParticipants participant) {
        if (!participant.getRole().canManageRoom()) {
            throw new CustomException(ErrorCode.CHAT_NO_PERMISSION);
        }
    }

    /**
     * 후보 전원이 나와 친구인지 한 번의 쿼리로 확인한다.
     *
     * 상호 판정을 쓴다. 방향 하나만 보면 나를 차단한 사람도 친구로 잡혀서, 차단해둔 상대가
     * 나를 단체방에 초대하거나 대화를 걸 수 있다.
     */
    private void requireFriendship(User me, List<Long> candidateIds) {
        if (candidateIds.isEmpty()) return;
        Set<Long> friendIds = new HashSet<>(friendRepository.findMutualFriendIdsAmong(me.getId(), candidateIds));
        if (!friendIds.containsAll(candidateIds)) {
            throw new CustomException(ErrorCode.CHAT_NOT_FRIENDS);
        }
    }

    private ChatParticipants newParticipant(ChatRoom room, User user, ChatRole role,
                                            LocalDateTime now, Long joinedMsgId) {
        return ChatParticipants.builder()
                .user(user)
                .chatRoom(room)
                .role(role)
                .joinedAt(now)
                .joinedMsgId(joinedMsgId)
                .lastReadMsgId(joinedMsgId)
                .lastReadDate(now)
                .notificationEnabled(true)
                .build();
    }

    private void restoreParticipantIfLeft(ChatRoom room, User user) {
        chatPTRepository.findByChatRoomAndUser(room, user).ifPresent(p -> {
            if (!Boolean.TRUE.equals(p.getIsValid())) {
                p.rejoin(LocalDateTime.now(), chatMsgRepository.findLastMsgIdByRoomId(room.getId()));
            }
        });
    }

    private static List<Long> distinctIdsExcluding(List<Long> ids, Long excluded) {
        if (ids == null) return List.of();
        return ids.stream()
                .filter(Objects::nonNull)
                .filter(id -> !id.equals(excluded))
                .distinct()
                .toList();
    }

    private String normalizeRoomName(String rawName, User creator, List<User> members) {
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty()) {
            // 이름을 비워 만들면 참여자 닉네임으로 조립한다.
            List<String> nicknames = new ArrayList<>();
            nicknames.add(creator.getNicknameValue());
            members.forEach(m -> nicknames.add(m.getNicknameValue()));
            name = String.join(", ", nicknames);
        }
        if (name.length() > MAX_ROOM_NAME_LENGTH) {
            name = name.substring(0, MAX_ROOM_NAME_LENGTH);
        }
        return name;
    }

    private static String previewOf(String content, boolean hasImage) {
        if (content != null && !content.isBlank()) {
            return content.length() > 255 ? content.substring(0, 255) : content;
        }
        return hasImage ? "사진" : "";
    }

    /** SYSTEM 메시지는 일반 메시지 스트림에 함께 실어 보낸다. 별도 채널이 필요 없다. */
    private void writeSystemMessage(ChatRoom room, User actor, String text) {
        ChatMsg systemMsg = ChatMsg.builder()
                .chatRoom(room)
                .sender(actor)
                .type(ChatMsgType.SYSTEM)
                .content(text)
                .build();
        chatMsgRepository.saveAndFlush(systemMsg);
        room.updateLastMessage(previewOf(text, false));

        // 페이로드는 지금 만든다 — 커밋 후에는 영속성 컨텍스트가 닫혀 지연 로딩이 깨진다 (KI-24).
        ChatMessageDto payload = ChatMessageDto.fromEntity(systemMsg, 0);
        Long roomId = room.getId();
        afterCommitExecutor.run(() ->
                messagingTemplate.convertAndSend("/topic/chat/room/" + roomId, payload));
    }

    private void publishMemberEvent(ChatRoom room, ChatMemberEventDto.EventType type,
                                    List<ChatMemberDto> targets, Long newOwnerId) {
        ChatMemberEventDto event = ChatMemberEventDto.builder()
                .roomId(room.getId())
                .eventType(type)
                .targets(targets)
                .memberCount(chatPTRepository.countByChatRoomAndIsValidTrue(room))
                .roomName(room.getName())
                .newOwnerId(newOwnerId)
                .build();
        // 초대·강퇴·퇴장·방장 위임이 롤백되면 클라이언트 멤버 목록만 바뀐 채로 남는다 (KI-24).
        Long roomId = room.getId();
        afterCommitExecutor.run(() ->
                messagingTemplate.convertAndSend("/topic/chat/room/" + roomId + "/members", event));
    }

    /** 참여자들의 읽음 위치를 정렬한 배열. 메시지별 미읽음 수를 이진탐색으로 구하기 위한 것. */
    private static long[] readPositionsOf(List<ChatParticipants> members) {
        return members.stream()
                .mapToLong(p -> p.getLastReadMsgId() == null ? 0L : p.getLastReadMsgId())
                .sorted()
                .toArray();
    }

    /**
     * 메시지 하나를 아직 읽지 않은 인원 수.
     * 발신자는 전송 시점에 읽음 위치가 자기 메시지까지 전진하므로 자동으로 제외된다.
     * 나중에 들어온 멤버도 입장 시 읽음 위치가 그 시점 최신 메시지로 맞춰져 과거 메시지에 잡히지 않는다.
     */
    private static int unreadCountOf(ChatMsg msg, long[] sortedReadPositions) {
        if (msg.getType() == ChatMsgType.SYSTEM) return 0;
        return countLessThan(sortedReadPositions, msg.getId());
    }

    private static int countLessThan(long[] sorted, long value) {
        int lo = 0, hi = sorted.length;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (sorted[mid] < value) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    private ChatRoomDto buildRoomDto(ChatRoom room, User me,
                                     List<ChatParticipants> members, int unreadCount) {
        Optional<ChatParticipants> mine = members.stream()
                .filter(p -> p.getUser().getId().equals(me.getId()))
                .findFirst();

        List<ChatMemberDto> preview = members.stream()
                .filter(p -> !p.getUser().getId().equals(me.getId()))
                .limit(ROOM_LIST_MEMBER_PREVIEW)
                .map(ChatMemberDto::fromEntity)
                .toList();

        return ChatRoomDto.builder()
                .roomId(room.getId())
                .roomName(resolveRoomName(room, me, members))
                .category(room.getCategory())
                .lastMessage(room.getLastMessage())
                .lastMessageAt(room.getUpdatedDate() != null ? room.getUpdatedDate() : room.getCreated())
                .unreadCount(unreadCount)
                .memberCount(members.size())
                .myRole(mine.map(ChatParticipants::getRole).orElse(ChatRole.MEMBER))
                .notificationEnabled(mine.map(ChatParticipants::isNotificationEnabled).orElse(true))
                .members(preview)
                .build();
    }

    /**
     * PRIVATE 방은 저장된 이름이 없으므로 상대 닉네임으로 조립해서 내려준다.
     * 덕분에 프론트는 category 분기 없이 roomName만 렌더하면 된다.
     */
    private String resolveRoomName(ChatRoom room, User me, List<ChatParticipants> members) {
        if (room.getCategory() == ChatRoomCategory.PRIVATE) {
            return members.stream()
                    .map(ChatParticipants::getUser)
                    .filter(u -> !u.getId().equals(me.getId()))
                    .map(User::getNicknameValue)
                    .findFirst()
                    .orElse("알 수 없음");
        }
        return room.getName();
    }
}
