package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.chat.ChatMsg;
import com.example.highteenday_backend.domain.chat.ChatMsgRepository;
import com.example.highteenday_backend.domain.chat.ChatPTRepository;
import com.example.highteenday_backend.domain.chat.ChatParticipants;
import com.example.highteenday_backend.domain.chat.ChatRoom;
import com.example.highteenday_backend.domain.chat.ChatRoomRepository;
import com.example.highteenday_backend.domain.friends.FriendRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.Chat.ChatMemberDto;
import com.example.highteenday_backend.dtos.Chat.ChatMemberEventDto;
import com.example.highteenday_backend.dtos.Chat.ChatMessageDto;
import com.example.highteenday_backend.dtos.Chat.ChatReadEventDto;
import com.example.highteenday_backend.dtos.Chat.ChatRoomDto;
import com.example.highteenday_backend.dtos.Chat.CreateGroupRoomDto;
import com.example.highteenday_backend.dtos.Chat.SendMessageDto;
import com.example.highteenday_backend.enums.ChatMsgType;
import com.example.highteenday_backend.enums.ChatRole;
import com.example.highteenday_backend.enums.ChatRoomCategory;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.RelationStatus;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.exceptions.CustomException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChatServiceTest {

    @Mock private ChatRoomRepository chatRoomRepository;
    @Mock private ChatMsgRepository chatMsgRepository;
    @Mock private ChatPTRepository chatPTRepository;
    @Mock private UserRepository userRepository;
    @Mock private FriendRepository friendRepository;
    @Mock private FriendService friendService;
    @Mock private SimpMessagingTemplate messagingTemplate;

    @InjectMocks private ChatService chatService;

    private User me;
    private User friend;
    private User stranger;

    @BeforeEach
    void setUp() {
        me = user(1L, "me");
        friend = user(2L, "friend");
        stranger = user(3L, "stranger");

        // 기본값: 요청 대상은 모두 상호 친구다. 친구가 아닌 상황은 각 테스트에서 덮어쓴다.
        // 이 스텁을 덮어쓰는 when(...) 호출이 다시 이 Answer를 실행하므로 null 인자를 견뎌야 한다.
        when(friendRepository.findMutualFriendIdsAmong(anyLong(), any()))
                .thenAnswer(inv -> {
                    Collection<Long> candidates = inv.getArgument(1);
                    return candidates == null ? List.of() : new ArrayList<>(candidates);
                });
        when(friendService.getRelations(anyLong(), any())).thenReturn(Map.of());
        when(chatMsgRepository.findLastMsgIdByRoomId(anyLong())).thenReturn(0L);
        when(chatPTRepository.save(any(ChatParticipants.class))).thenAnswer(inv -> inv.getArgument(0));
        // 저장 시 PK가 채워지는 것을 흉내낸다. 미읽음 수 계산이 msg.getId()를 long으로 언박싱하므로
        // id가 null이면 NPE가 나 실제 동작과 달라진다.
        when(chatMsgRepository.saveAndFlush(any(ChatMsg.class))).thenAnswer(inv -> {
            ChatMsg msg = inv.getArgument(0);
            if (msg.getId() == null) ReflectionTestUtils.setField(msg, "id", 500L);
            return msg;
        });
    }

    // ------------------------------------------------------------------
    // 픽스처 헬퍼
    // ------------------------------------------------------------------

    /** 이메일은 닉네임과 무관하게 id로 만든다. 닉네임에 한글이 들어가면 이메일 정규식을 통과하지 못한다. */
    private static User user(Long id, String nickname) {
        return User.builder()
                .id(id)
                .email(new Email("user" + id + "@test.com"))
                .name(new UserName("이름" + id))
                .nickname(new Nickname(nickname))
                .role(Role.USER)
                .build();
    }

    private static ChatRoom groupRoom(Long id, User owner) {
        return ChatRoom.builder()
                .id(id)
                .name("단체방")
                .category(ChatRoomCategory.GROUP)
                .owner(owner)
                .build();
    }

    private static ChatRoom privateRoom(Long id, Long userIdA, Long userIdB) {
        return ChatRoom.builder()
                .id(id)
                .category(ChatRoomCategory.PRIVATE)
                .pairKey(ChatRoom.pairKeyOf(userIdA, userIdB))
                .build();
    }

    private static ChatParticipants participant(ChatRoom room, User user, ChatRole role) {
        return participant(room, user, role, 0L, LocalDateTime.now());
    }

    private static ChatParticipants participant(ChatRoom room, User user, ChatRole role,
                                                Long lastReadMsgId, LocalDateTime joinedAt) {
        return ChatParticipants.builder()
                .user(user)
                .chatRoom(room)
                .role(role)
                .joinedAt(joinedAt)
                .joinedMsgId(0L)
                .lastReadMsgId(lastReadMsgId)
                .lastReadDate(joinedAt)
                .notificationEnabled(true)
                .build();
    }

    private static ChatMsg message(Long id, ChatRoom room, User sender, ChatMsgType type) {
        return ChatMsg.builder()
                .id(id)
                .chatRoom(room)
                .sender(sender)
                .type(type)
                .content("내용" + id)
                .build();
    }

    /** 방과 그 방의 활성 참여자를 한 번에 스텁한다. */
    private void stubRoom(ChatRoom room, ChatParticipants... participants) {
        when(chatRoomRepository.findById(room.getId())).thenReturn(Optional.of(room));
        List<ChatParticipants> active = Arrays.stream(participants)
                .filter(p -> Boolean.TRUE.equals(p.getIsValid()))
                .toList();
        when(chatPTRepository.findActiveMembers(room)).thenAnswer(inv ->
                Arrays.stream(participants).filter(p -> Boolean.TRUE.equals(p.getIsValid())).toList());
        when(chatPTRepository.countByChatRoomAndIsValidTrue(room)).thenAnswer(inv ->
                (int) Arrays.stream(participants).filter(p -> Boolean.TRUE.equals(p.getIsValid())).count());
        for (ChatParticipants p : participants) {
            when(chatPTRepository.findByChatRoomAndUser(room, p.getUser())).thenReturn(Optional.of(p));
            when(userRepository.findById(p.getUser().getId())).thenReturn(Optional.of(p.getUser()));
        }
        assertThat(active).isNotNull();
    }

    private static ChatMsgRepository.UnreadCountProjection unread(Long roomId, Long count) {
        return new ChatMsgRepository.UnreadCountProjection() {
            @Override public Long getRoomId() { return roomId; }
            @Override public Long getUnreadCount() { return count; }
        };
    }

    private static void assertErrorCode(Throwable thrown, ErrorCode expected) {
        assertThat(thrown).isInstanceOf(CustomException.class);
        assertThat(((CustomException) thrown).getErrorCode()).isEqualTo(expected);
    }

    // ==================================================================
    // 공통 진입 검증 — findRoom / requireParticipant
    // ==================================================================

    @Nested
    @DisplayName("방·참여자 확인 (모든 메서드의 공통 관문)")
    class RoomAndParticipantGuards {

        @Test
        @DisplayName("존재하지 않는 방 → CHAT_ROOM_NOT_FOUND")
        void throwsWhenRoomMissing() {
            when(chatRoomRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> chatService.getRoomDetail(me, 99L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_ROOM_NOT_FOUND));
        }

        @Test
        @DisplayName("soft delete된 방 → CHAT_ROOM_NOT_FOUND")
        void throwsWhenRoomDeleted() {
            ChatRoom room = groupRoom(10L, me);
            room.delete();
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));

            assertThatThrownBy(() -> chatService.getRoomDetail(me, 10L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_ROOM_NOT_FOUND));
        }

        @Test
        @DisplayName("참여자 행이 아예 없음 → CHAT_NOT_PARTICIPANT")
        void throwsWhenNotParticipant() {
            ChatRoom room = groupRoom(10L, me);
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, stranger)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> chatService.getRoomDetail(stranger, 10L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_PARTICIPANT));
        }

        @Test
        @DisplayName("나갔던 참여자(isValid=false)는 참여자로 인정되지 않는다")
        void throwsWhenParticipantLeft() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants left = participant(room, stranger, ChatRole.MEMBER);
            left.delete();
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, stranger)).thenReturn(Optional.of(left));

            assertThatThrownBy(() -> chatService.getRoomDetail(stranger, 10L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_PARTICIPANT));
        }
    }

    // ==================================================================
    // getOrCreatePrivateRoom
    // ==================================================================

    @Nested
    @DisplayName("getOrCreatePrivateRoom")
    class GetOrCreatePrivateRoom {

        @Test
        @DisplayName("방이 없으면 PRIVATE 방과 참여자 2명을 만든다")
        void createsRoomWithTwoParticipants() {
            when(userRepository.findById(2L)).thenReturn(Optional.of(friend));
            when(chatRoomRepository.findByPairKey("1:2")).thenReturn(Optional.empty());
            when(chatPTRepository.findActiveMembers(any())).thenReturn(List.of());

            chatService.getOrCreatePrivateRoom(me, 2L);

            ArgumentCaptor<ChatRoom> roomCaptor = ArgumentCaptor.forClass(ChatRoom.class);
            verify(chatRoomRepository).saveAndFlush(roomCaptor.capture());
            assertThat(roomCaptor.getValue().getCategory()).isEqualTo(ChatRoomCategory.PRIVATE);
            assertThat(roomCaptor.getValue().getPairKey()).isEqualTo("1:2");

            ArgumentCaptor<ChatParticipants> ptCaptor = ArgumentCaptor.forClass(ChatParticipants.class);
            verify(chatPTRepository, times(2)).save(ptCaptor.capture());
            assertThat(ptCaptor.getAllValues())
                    .extracting(p -> p.getUser().getId())
                    .containsExactly(1L, 2L);
            assertThat(ptCaptor.getAllValues())
                    .allSatisfy(p -> assertThat(p.getRole()).isEqualTo(ChatRole.MEMBER));
        }

        @Test
        @DisplayName("pairKey는 id 순서와 무관하게 같은 값이다 — 양쪽이 동시에 걸어도 방은 하나")
        void pairKeyIsOrderIndependent() {
            assertThat(ChatRoom.pairKeyOf(1L, 2L)).isEqualTo(ChatRoom.pairKeyOf(2L, 1L));
            assertThat(ChatRoom.pairKeyOf(2L, 1L)).isEqualTo("1:2");
        }

        @Test
        @DisplayName("이미 방이 있으면 새로 만들지 않고 재사용한다")
        void reusesExistingRoom() {
            ChatRoom existing = privateRoom(10L, 1L, 2L);
            when(userRepository.findById(2L)).thenReturn(Optional.of(friend));
            when(chatRoomRepository.findByPairKey("1:2")).thenReturn(Optional.of(existing));
            stubRoom(existing,
                    participant(existing, me, ChatRole.MEMBER),
                    participant(existing, friend, ChatRole.MEMBER));

            ChatRoomDto result = chatService.getOrCreatePrivateRoom(me, 2L);

            assertThat(result.roomId()).isEqualTo(10L);
            verify(chatRoomRepository, never()).saveAndFlush(any());
            verify(chatPTRepository, never()).save(any());
        }

        @Test
        @DisplayName("나갔던 참여자는 재입장 처리된다 — 이전 대화는 가려진다")
        void restoresLeftParticipant() {
            ChatRoom existing = privateRoom(10L, 1L, 2L);
            ChatParticipants myLeftRow = participant(existing, me, ChatRole.MEMBER);
            myLeftRow.delete();
            ChatParticipants friendRow = participant(existing, friend, ChatRole.MEMBER);

            when(userRepository.findById(2L)).thenReturn(Optional.of(friend));
            when(chatRoomRepository.findByPairKey("1:2")).thenReturn(Optional.of(existing));
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(existing));
            when(chatPTRepository.findByChatRoomAndUser(existing, me)).thenReturn(Optional.of(myLeftRow));
            when(chatPTRepository.findByChatRoomAndUser(existing, friend)).thenReturn(Optional.of(friendRow));
            when(chatPTRepository.findActiveMembers(existing)).thenReturn(List.of(friendRow));
            when(chatMsgRepository.findLastMsgIdByRoomId(10L)).thenReturn(42L);

            chatService.getOrCreatePrivateRoom(me, 2L);

            assertThat(myLeftRow.getIsValid()).isTrue();
            assertThat(myLeftRow.getJoinedMsgId()).isEqualTo(42L);
            assertThat(myLeftRow.getLastReadMsgId()).isEqualTo(42L);
            // 이미 참여 중인 쪽은 건드리지 않는다
            assertThat(friendRow.getJoinedMsgId()).isEqualTo(0L);
        }

        @Test
        @DisplayName("상대가 없으면 USER_NOT_FOUND")
        void throwsWhenFriendMissing() {
            when(userRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> chatService.getOrCreatePrivateRoom(me, 99L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.USER_NOT_FOUND));
        }

        @Test
        @DisplayName("친구가 아니면 CHAT_NOT_FRIENDS")
        void throwsWhenNotFriends() {
            when(userRepository.findById(3L)).thenReturn(Optional.of(stranger));
            when(friendRepository.findMutualFriendIdsAmong(eq(1L), any())).thenReturn(List.of());

            assertThatThrownBy(() -> chatService.getOrCreatePrivateRoom(me, 3L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_FRIENDS));

            verify(chatRoomRepository, never()).saveAndFlush(any());
        }

        @Test
        @DisplayName("한쪽만 친구인 관계(=상대가 나를 차단)는 친구로 인정되지 않는다")
        void requiresMutualFriendship() {
            // findMutualFriendIdsAmong 은 상호 FRIEND만 돌려준다. 단방향이면 빈 결과다.
            when(userRepository.findById(2L)).thenReturn(Optional.of(friend));
            when(friendRepository.findMutualFriendIdsAmong(eq(1L), any())).thenReturn(List.of());

            assertThatThrownBy(() -> chatService.getOrCreatePrivateRoom(me, 2L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_FRIENDS));
        }

        @Test
        @DisplayName("동시 생성으로 UNIQUE 충돌 시 먼저 만들어진 방을 반환한다")
        void fallsBackToWinnerRoomOnUniqueViolation() {
            ChatRoom winner = privateRoom(10L, 1L, 2L);
            when(userRepository.findById(2L)).thenReturn(Optional.of(friend));
            when(chatRoomRepository.findByPairKey("1:2"))
                    .thenReturn(Optional.empty())      // 최초 확인 — 없음
                    .thenReturn(Optional.of(winner));  // 충돌 후 재조회 — 경쟁자가 만든 방
            when(chatRoomRepository.saveAndFlush(any(ChatRoom.class)))
                    .thenThrow(new DataIntegrityViolationException("uk_chat_rooms_pair_key"));
            when(chatPTRepository.findActiveMembers(winner))
                    .thenReturn(List.of(participant(winner, friend, ChatRole.MEMBER)));

            ChatRoomDto result = chatService.getOrCreatePrivateRoom(me, 2L);

            assertThat(result.roomId()).isEqualTo(10L);
            // 승자 방에 참여자를 또 만들지 않는다
            verify(chatPTRepository, never()).save(any());
        }

        @Test
        @DisplayName("충돌 후 재조회도 실패하면 CHAT_ROOM_NOT_FOUND")
        void throwsWhenWinnerRoomNotFound() {
            when(userRepository.findById(2L)).thenReturn(Optional.of(friend));
            when(chatRoomRepository.findByPairKey("1:2")).thenReturn(Optional.empty());
            when(chatRoomRepository.saveAndFlush(any(ChatRoom.class)))
                    .thenThrow(new DataIntegrityViolationException("uk_chat_rooms_pair_key"));

            assertThatThrownBy(() -> chatService.getOrCreatePrivateRoom(me, 2L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_ROOM_NOT_FOUND));
        }
    }

    // ==================================================================
    // createGroupRoom
    // ==================================================================

    @Nested
    @DisplayName("createGroupRoom")
    class CreateGroupRoom {

        @Test
        @DisplayName("생성자는 OWNER, 초대된 사람은 MEMBER로 참여한다")
        void assignsOwnerAndMemberRoles() {
            when(userRepository.findAllById(List.of(2L, 3L))).thenReturn(List.of(friend, stranger));
            when(chatPTRepository.findActiveMembers(any())).thenReturn(List.of());

            chatService.createGroupRoom(me, new CreateGroupRoomDto("모임", List.of(2L, 3L)));

            ArgumentCaptor<ChatParticipants> captor = ArgumentCaptor.forClass(ChatParticipants.class);
            verify(chatPTRepository, times(3)).save(captor.capture());
            assertThat(captor.getAllValues())
                    .extracting(p -> p.getUser().getId(), ChatParticipants::getRole)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple(1L, ChatRole.OWNER),
                            org.assertj.core.groups.Tuple.tuple(2L, ChatRole.MEMBER),
                            org.assertj.core.groups.Tuple.tuple(3L, ChatRole.MEMBER));
        }

        @Test
        @DisplayName("생성 안내 SYSTEM 메시지를 남기고 방 토픽으로 발행한다")
        void writesSystemMessage() {
            when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(friend));
            when(chatPTRepository.findActiveMembers(any())).thenReturn(List.of());

            chatService.createGroupRoom(me, new CreateGroupRoomDto("모임", List.of(2L)));

            ArgumentCaptor<ChatMsg> msgCaptor = ArgumentCaptor.forClass(ChatMsg.class);
            verify(chatMsgRepository).saveAndFlush(msgCaptor.capture());
            assertThat(msgCaptor.getValue().getType()).isEqualTo(ChatMsgType.SYSTEM);
            assertThat(msgCaptor.getValue().getContent()).isEqualTo("me님이 채팅방을 만들었습니다.");
            assertThat(msgCaptor.getValue().getClientMsgId()).isNull();
        }

        @Test
        @DisplayName("나 자신은 초대 목록에서 제외되고 중복 id는 한 번만 센다")
        void deduplicatesAndExcludesSelf() {
            when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(friend));
            when(chatPTRepository.findActiveMembers(any())).thenReturn(List.of());

            chatService.createGroupRoom(me,
                    new CreateGroupRoomDto("모임", Arrays.asList(2L, 2L, 1L, null)));

            verify(userRepository).findAllById(List.of(2L));
            verify(chatPTRepository, times(2)).save(any()); // 나 + 친구 1명
        }

        @Test
        @DisplayName("초대할 사람이 없으면 CHAT_INVALID_MEMBER_COUNT")
        void throwsWhenNoMembers() {
            assertThatThrownBy(() -> chatService.createGroupRoom(me,
                    new CreateGroupRoomDto("모임", List.of(1L))))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_INVALID_MEMBER_COUNT));
        }

        @Test
        @DisplayName("memberIds가 null이어도 NPE 없이 CHAT_INVALID_MEMBER_COUNT")
        void throwsWhenMemberIdsNull() {
            assertThatThrownBy(() -> chatService.createGroupRoom(me,
                    new CreateGroupRoomDto("모임", null)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_INVALID_MEMBER_COUNT));
        }

        @Test
        @DisplayName("나를 포함해 정확히 100명이면 만들 수 있다 — 정원 경계")
        void allowsExactlyMaxMembers() {
            List<Long> ids = IntStream.rangeClosed(2, 100).boxed().map(Long::valueOf).toList();
            List<User> users = ids.stream().map(id -> user(id, "u" + id)).toList();
            assertThat(ids).hasSize(99); // 99명 + 나 = 100
            when(userRepository.findAllById(ids)).thenReturn(users);
            when(chatPTRepository.findActiveMembers(any())).thenReturn(List.of());

            chatService.createGroupRoom(me, new CreateGroupRoomDto("모임", ids));

            verify(chatRoomRepository).save(any(ChatRoom.class));
        }

        @Test
        @DisplayName("나를 포함해 101명이면 CHAT_ROOM_FULL — 정원 경계 바로 밖")
        void throwsWhenOverMaxMembers() {
            List<Long> ids = IntStream.rangeClosed(2, 101).boxed().map(Long::valueOf).toList();
            assertThat(ids).hasSize(100); // 100명 + 나 = 101

            assertThatThrownBy(() -> chatService.createGroupRoom(me,
                    new CreateGroupRoomDto("모임", ids)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_ROOM_FULL));

            verify(chatRoomRepository, never()).save(any());
        }

        @Test
        @DisplayName("친구가 아닌 사람이 섞여 있으면 CHAT_NOT_FRIENDS")
        void throwsWhenAnyCandidateNotFriend() {
            // 3L만 친구가 아닌 상황
            when(friendRepository.findMutualFriendIdsAmong(eq(1L), any())).thenReturn(List.of(2L));

            assertThatThrownBy(() -> chatService.createGroupRoom(me,
                    new CreateGroupRoomDto("모임", List.of(2L, 3L))))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_FRIENDS));

            verify(chatRoomRepository, never()).save(any());
        }

        @Test
        @DisplayName("조회된 유저 수가 요청과 다르면 USER_NOT_FOUND")
        void throwsWhenSomeUserMissing() {
            when(userRepository.findAllById(List.of(2L, 3L))).thenReturn(List.of(friend));

            assertThatThrownBy(() -> chatService.createGroupRoom(me,
                    new CreateGroupRoomDto("모임", List.of(2L, 3L))))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.USER_NOT_FOUND));
        }

        @ParameterizedTest
        @ValueSource(strings = {"", "   "})
        @DisplayName("이름을 비우면 참여자 닉네임으로 조립한다")
        void buildsNameFromNicknamesWhenBlank(String rawName) {
            when(userRepository.findAllById(List.of(2L, 3L))).thenReturn(List.of(friend, stranger));
            when(chatPTRepository.findActiveMembers(any())).thenReturn(List.of());

            chatService.createGroupRoom(me, new CreateGroupRoomDto(rawName, List.of(2L, 3L)));

            ArgumentCaptor<ChatRoom> captor = ArgumentCaptor.forClass(ChatRoom.class);
            verify(chatRoomRepository).save(captor.capture());
            assertThat(captor.getValue().getName()).isEqualTo("me, friend, stranger");
        }

        @Test
        @DisplayName("이름이 null이어도 닉네임으로 조립한다")
        void buildsNameFromNicknamesWhenNull() {
            when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(friend));
            when(chatPTRepository.findActiveMembers(any())).thenReturn(List.of());

            chatService.createGroupRoom(me, new CreateGroupRoomDto(null, List.of(2L)));

            ArgumentCaptor<ChatRoom> captor = ArgumentCaptor.forClass(ChatRoom.class);
            verify(chatRoomRepository).save(captor.capture());
            assertThat(captor.getValue().getName()).isEqualTo("me, friend");
        }

        @Test
        @DisplayName("30자를 넘는 이름은 30자로 자른다")
        void truncatesLongName() {
            String longName = "가".repeat(40);
            when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(friend));
            when(chatPTRepository.findActiveMembers(any())).thenReturn(List.of());

            chatService.createGroupRoom(me, new CreateGroupRoomDto(longName, List.of(2L)));

            ArgumentCaptor<ChatRoom> captor = ArgumentCaptor.forClass(ChatRoom.class);
            verify(chatRoomRepository).save(captor.capture());
            assertThat(captor.getValue().getName()).hasSize(30);
        }

        @Test
        @DisplayName("닉네임 조립 결과가 30자를 넘어도 잘린다")
        void truncatesAssembledName() {
            List<Long> ids = IntStream.rangeClosed(2, 12).boxed().map(Long::valueOf).toList();
            List<User> users = ids.stream().map(id -> user(id, "닉네임" + id)).toList();
            when(userRepository.findAllById(ids)).thenReturn(users);
            when(chatPTRepository.findActiveMembers(any())).thenReturn(List.of());

            chatService.createGroupRoom(me, new CreateGroupRoomDto(null, ids));

            ArgumentCaptor<ChatRoom> captor = ArgumentCaptor.forClass(ChatRoom.class);
            verify(chatRoomRepository).save(captor.capture());
            assertThat(captor.getValue().getName()).hasSize(30);
        }
    }

    // ==================================================================
    // sendMessage
    // ==================================================================

    @Nested
    @DisplayName("sendMessage")
    class SendMessage {

        private ChatRoom room;
        private ChatParticipants myRow;
        private ChatParticipants friendRow;

        @BeforeEach
        void setUp() {
            room = groupRoom(10L, me);
            myRow = participant(room, me, ChatRole.OWNER, 0L, LocalDateTime.now());
            friendRow = participant(room, friend, ChatRole.MEMBER, 0L, LocalDateTime.now());
            stubRoom(room, myRow, friendRow);
        }

        @Test
        @DisplayName("본문이 있으면 TEXT로 저장하고 방 미리보기를 갱신한다")
        void savesTextMessage() {
            ChatMessageDto result = chatService.sendMessage(me,
                    new SendMessageDto(10L, "안녕", null, "uuid-1"));

            ArgumentCaptor<ChatMsg> captor = ArgumentCaptor.forClass(ChatMsg.class);
            verify(chatMsgRepository).saveAndFlush(captor.capture());
            assertThat(captor.getValue().getType()).isEqualTo(ChatMsgType.TEXT);
            assertThat(captor.getValue().getContent()).isEqualTo("안녕");
            assertThat(captor.getValue().getClientMsgId()).isEqualTo("uuid-1");
            assertThat(room.getLastMessage()).isEqualTo("안녕");
            assertThat(result.content()).isEqualTo("안녕");
        }

        @Test
        @DisplayName("본문 없이 이미지만 있으면 IMAGE로 저장하고 미리보기는 '사진'")
        void savesImageOnlyMessage() {
            chatService.sendMessage(me, new SendMessageDto(10L, null, "https://s3/a.png", "uuid-2"));

            ArgumentCaptor<ChatMsg> captor = ArgumentCaptor.forClass(ChatMsg.class);
            verify(chatMsgRepository).saveAndFlush(captor.capture());
            assertThat(captor.getValue().getType()).isEqualTo(ChatMsgType.IMAGE);
            assertThat(room.getLastMessage()).isEqualTo("사진");
        }

        @Test
        @DisplayName("본문과 이미지가 함께 오면 TEXT로 저장하고 이미지도 보관한다")
        void savesTextWithImage() {
            chatService.sendMessage(me, new SendMessageDto(10L, "사진 첨부", "https://s3/a.png", null));

            ArgumentCaptor<ChatMsg> captor = ArgumentCaptor.forClass(ChatMsg.class);
            verify(chatMsgRepository).saveAndFlush(captor.capture());
            assertThat(captor.getValue().getType()).isEqualTo(ChatMsgType.TEXT);
            assertThat(captor.getValue().getImageUrl()).isEqualTo("https://s3/a.png");
        }

        @ParameterizedTest
        @CsvSource(value = {
                "NULL,NULL",
                "'',''",
                "'   ','   '",
                "NULL,''",
                "'',NULL"
        }, nullValues = "NULL")
        @DisplayName("본문과 이미지가 모두 비어 있으면 CHAT_EMPTY_MESSAGE")
        void throwsOnEmptyMessage(String content, String imageUrl) {
            assertThatThrownBy(() -> chatService.sendMessage(me,
                    new SendMessageDto(10L, content, imageUrl, null)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_EMPTY_MESSAGE));

            verify(chatMsgRepository, never()).saveAndFlush(any());
        }

        @Test
        @DisplayName("같은 clientMsgId가 이미 있으면 저장하지 않고 원본을 돌려준다 — 재전송 멱등성")
        void isIdempotentOnDuplicateClientMsgId() {
            ChatMsg original = message(77L, room, me, ChatMsgType.TEXT);
            when(chatMsgRepository.findByChatRoomIdAndClientMsgId(10L, "uuid-dup"))
                    .thenReturn(Optional.of(original));

            ChatMessageDto result = chatService.sendMessage(me,
                    new SendMessageDto(10L, "안녕", null, "uuid-dup"));

            assertThat(result.messageId()).isEqualTo(77L);
            verify(chatMsgRepository, never()).saveAndFlush(any());
            // 원본을 돌려주는 경로에서는 방 미리보기를 다시 건드리지 않는다
            assertThat(room.getLastMessage()).isNull();
        }

        @Test
        @DisplayName("clientMsgId가 null이면 중복 조회를 건너뛴다")
        void skipsDuplicateLookupWhenClientMsgIdNull() {
            chatService.sendMessage(me, new SendMessageDto(10L, "안녕", null, null));

            verify(chatMsgRepository, never()).findByChatRoomIdAndClientMsgId(anyLong(), any());
            verify(chatMsgRepository).saveAndFlush(any(ChatMsg.class));
        }

        @Test
        @DisplayName("동시 재전송으로 UNIQUE 충돌 시 먼저 저장된 메시지를 반환한다")
        void fallsBackToWinnerMessageOnUniqueViolation() {
            ChatMsg winner = message(88L, room, me, ChatMsgType.TEXT);
            when(chatMsgRepository.findByChatRoomIdAndClientMsgId(10L, "uuid-race"))
                    .thenReturn(Optional.empty())     // 최초 확인 — 없음
                    .thenReturn(Optional.of(winner)); // 충돌 후 재조회
            when(chatMsgRepository.saveAndFlush(any(ChatMsg.class)))
                    .thenThrow(new DataIntegrityViolationException("uk_chat_messages_room_client"));

            ChatMessageDto result = chatService.sendMessage(me,
                    new SendMessageDto(10L, "안녕", null, "uuid-race"));

            assertThat(result.messageId()).isEqualTo(88L);
        }

        @Test
        @DisplayName("충돌 후 재조회도 실패하면 DATA_INTEGRITY_ERROR")
        void throwsWhenWinnerMessageNotFound() {
            when(chatMsgRepository.findByChatRoomIdAndClientMsgId(10L, "uuid-race"))
                    .thenReturn(Optional.empty());
            when(chatMsgRepository.saveAndFlush(any(ChatMsg.class)))
                    .thenThrow(new DataIntegrityViolationException("uk_chat_messages_room_client"));

            assertThatThrownBy(() -> chatService.sendMessage(me,
                    new SendMessageDto(10L, "안녕", null, "uuid-race")))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.DATA_INTEGRITY_ERROR));
        }

        @Test
        @DisplayName("발신자의 읽음 위치가 자기 메시지까지 전진한다 — 미읽음 집계에서 자동 제외")
        void advancesSenderReadPosition() {
            chatService.sendMessage(me, new SendMessageDto(10L, "안녕", null, null));

            assertThat(myRow.getLastReadMsgId()).isEqualTo(500L);
        }

        @Test
        @DisplayName("미읽음 수는 나를 뺀 나머지 인원 — 2인 방에서 1")
        void countsUnreadExcludingSender() {
            ChatMessageDto result = chatService.sendMessage(me,
                    new SendMessageDto(10L, "안녕", null, null));

            assertThat(result.unreadCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("이미 최신까지 읽은 사람은 미읽음에 잡히지 않는다")
        void excludesAlreadyCaughtUpMembers() {
            // 상대의 읽음 위치를 새 메시지 id(500) 이상으로 올려 둔다
            friendRow.updateLastReadMsgId(600L);

            ChatMessageDto result = chatService.sendMessage(me,
                    new SendMessageDto(10L, "안녕", null, null));

            assertThat(result.unreadCount()).isZero();
        }

        @Test
        @DisplayName("참여자가 아니면 CHAT_NOT_PARTICIPANT — 저장하지 않는다")
        void throwsWhenSenderNotParticipant() {
            when(chatPTRepository.findByChatRoomAndUser(room, stranger)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> chatService.sendMessage(stranger,
                    new SendMessageDto(10L, "안녕", null, null)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_PARTICIPANT));

            verify(chatMsgRepository, never()).saveAndFlush(any());
        }

        @Test
        @DisplayName("255자를 넘는 본문은 미리보기에서만 잘린다 — 본문 자체는 보존된다")
        void truncatesPreviewOnly() {
            String longText = "가".repeat(300);

            chatService.sendMessage(me, new SendMessageDto(10L, longText, null, null));

            assertThat(room.getLastMessage()).hasSize(255);
            ArgumentCaptor<ChatMsg> captor = ArgumentCaptor.forClass(ChatMsg.class);
            verify(chatMsgRepository).saveAndFlush(captor.capture());
            assertThat(captor.getValue().getContent()).hasSize(300);
        }
    }

    // ==================================================================
    // markAsRead
    // ==================================================================

    @Nested
    @DisplayName("markAsRead")
    class MarkAsRead {

        private ChatRoom room;
        private ChatParticipants myRow;

        @BeforeEach
        void setUp() {
            room = groupRoom(10L, me);
            myRow = participant(room, me, ChatRole.MEMBER, 5L, LocalDateTime.now());
            stubRoom(room, myRow, participant(room, friend, ChatRole.MEMBER));
        }

        @Test
        @DisplayName("읽음 위치가 전진하면 read 토픽으로 발행한다")
        void broadcastsWhenAdvanced() {
            chatService.markAsRead(me, 10L, 9L);

            assertThat(myRow.getLastReadMsgId()).isEqualTo(9L);

            ArgumentCaptor<ChatReadEventDto> captor = ArgumentCaptor.forClass(ChatReadEventDto.class);
            verify(messagingTemplate).convertAndSend(eq("/topic/chat/room/10/read"), captor.capture());
            assertThat(captor.getValue().userId()).isEqualTo(1L);
            assertThat(captor.getValue().lastReadMsgId()).isEqualTo(9L);
        }

        @Test
        @DisplayName("lastMsgId가 null이면 방의 최신 메시지까지 읽은 것으로 처리한다")
        void usesRoomLastMsgIdWhenNull() {
            when(chatMsgRepository.findLastMsgIdByRoomId(10L)).thenReturn(20L);

            chatService.markAsRead(me, 10L, null);

            assertThat(myRow.getLastReadMsgId()).isEqualTo(20L);
        }

        @Test
        @DisplayName("같은 위치를 다시 읽어도 발행하지 않는다 — 단체방 증폭 방지")
        void doesNotBroadcastWhenUnchanged() {
            chatService.markAsRead(me, 10L, 5L);

            assertThat(myRow.getLastReadMsgId()).isEqualTo(5L);
            verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
        }

        @Test
        @DisplayName("지연 도착한 과거 위치는 상태를 되돌리지 않고 발행도 하지 않는다")
        void ignoresStaleReadPosition() {
            chatService.markAsRead(me, 10L, 3L);

            assertThat(myRow.getLastReadMsgId()).isEqualTo(5L);
            verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
        }

        @Test
        @DisplayName("참여자가 아니면 CHAT_NOT_PARTICIPANT")
        void throwsWhenNotParticipant() {
            when(chatPTRepository.findByChatRoomAndUser(room, stranger)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> chatService.markAsRead(stranger, 10L, 9L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_PARTICIPANT));
        }
    }

    // ==================================================================
    // getChatMessages
    // ==================================================================

    @Nested
    @DisplayName("getChatMessages")
    class GetChatMessages {

        private ChatRoom room;
        private ChatParticipants myRow;

        @BeforeEach
        void setUp() {
            room = groupRoom(10L, me);
            myRow = participant(room, me, ChatRole.MEMBER, 0L, LocalDateTime.now());
            stubRoom(room, myRow, participant(room, friend, ChatRole.MEMBER));
        }

        @Test
        @DisplayName("저장소는 최신순으로 주지만 반환은 오래된 것부터다")
        void reversesToChronologicalOrder() {
            when(chatMsgRepository.findByRoomIdWithCursor(anyLong(), anyLong(), anyLong(), any()))
                    .thenReturn(List.of(
                            message(3L, room, me, ChatMsgType.TEXT),
                            message(2L, room, me, ChatMsgType.TEXT),
                            message(1L, room, me, ChatMsgType.TEXT)));

            List<ChatMessageDto> result = chatService.getChatMessages(me, 10L, null, null);

            assertThat(result).extracting(ChatMessageDto::messageId).containsExactly(1L, 2L, 3L);
        }

        @Test
        @DisplayName("cursor가 null이면 Long.MAX_VALUE로 최신부터 조회한다")
        void usesMaxValueWhenCursorNull() {
            when(chatMsgRepository.findByRoomIdWithCursor(anyLong(), anyLong(), anyLong(), any()))
                    .thenReturn(List.of());

            chatService.getChatMessages(me, 10L, null, null);

            verify(chatMsgRepository).findByRoomIdWithCursor(
                    eq(10L), eq(Long.MAX_VALUE), eq(0L), eq(PageRequest.of(0, 50)));
        }

        @Test
        @DisplayName("cursor가 주어지면 그 값을 그대로 쓴다")
        void passesCursorThrough() {
            when(chatMsgRepository.findByRoomIdWithCursor(anyLong(), anyLong(), anyLong(), any()))
                    .thenReturn(List.of());

            chatService.getChatMessages(me, 10L, 100L, 10);

            verify(chatMsgRepository).findByRoomIdWithCursor(
                    eq(10L), eq(100L), eq(0L), eq(PageRequest.of(0, 10)));
        }

        @ParameterizedTest
        @CsvSource(value = {
                "NULL,50",  // 미지정 → 기본값
                "0,50",     // 0 → 기본값
                "-1,50",    // 음수 → 기본값
                "51,50",    // 상한 초과 → 기본값
                "1,1",      // 하한 경계
                "50,50"     // 상한 경계
        }, nullValues = "NULL")
        @DisplayName("size는 1~50으로 정규화된다")
        void normalizesPageSize(Integer requested, int expected) {
            when(chatMsgRepository.findByRoomIdWithCursor(anyLong(), anyLong(), anyLong(), any()))
                    .thenReturn(List.of());

            chatService.getChatMessages(me, 10L, null, requested);

            verify(chatMsgRepository).findByRoomIdWithCursor(
                    anyLong(), anyLong(), anyLong(), eq(PageRequest.of(0, expected)));
        }

        @Test
        @DisplayName("입장 시점(joinedMsgId)이 하한선으로 전달된다 — 그 이전 대화는 안 보인다")
        void passesJoinedMsgIdAsFloor() {
            ReflectionTestUtils.setField(myRow, "joinedMsgId", 40L);
            when(chatMsgRepository.findByRoomIdWithCursor(anyLong(), anyLong(), anyLong(), any()))
                    .thenReturn(List.of());

            chatService.getChatMessages(me, 10L, null, null);

            verify(chatMsgRepository).findByRoomIdWithCursor(anyLong(), anyLong(), eq(40L), any());
        }

        @Test
        @DisplayName("joinedMsgId가 null이면 하한선은 0")
        void defaultsFloorToZero() {
            ReflectionTestUtils.setField(myRow, "joinedMsgId", null);
            when(chatMsgRepository.findByRoomIdWithCursor(anyLong(), anyLong(), anyLong(), any()))
                    .thenReturn(List.of());

            chatService.getChatMessages(me, 10L, null, null);

            verify(chatMsgRepository).findByRoomIdWithCursor(anyLong(), anyLong(), eq(0L), any());
        }

        @Test
        @DisplayName("SYSTEM 메시지의 미읽음 수는 항상 0")
        void systemMessageHasNoUnreadCount() {
            when(chatMsgRepository.findByRoomIdWithCursor(anyLong(), anyLong(), anyLong(), any()))
                    .thenReturn(List.of(message(9L, room, me, ChatMsgType.SYSTEM)));

            List<ChatMessageDto> result = chatService.getChatMessages(me, 10L, null, null);

            assertThat(result).singleElement()
                    .satisfies(dto -> assertThat(dto.unreadCount()).isZero());
        }

        @Test
        @DisplayName("메시지별 미읽음 수는 읽음 위치보다 뒤에 있는 인원 수로 계산된다")
        void countsUnreadPerMessage() {
            // 참여자 3명의 읽음 위치: 0, 5, 10
            ChatRoom r = groupRoom(11L, me);
            stubRoom(r,
                    participant(r, me, ChatRole.MEMBER, 0L, LocalDateTime.now()),
                    participant(r, friend, ChatRole.MEMBER, 5L, LocalDateTime.now()),
                    participant(r, stranger, ChatRole.MEMBER, 10L, LocalDateTime.now()));
            when(chatMsgRepository.findByRoomIdWithCursor(eq(11L), anyLong(), anyLong(), any()))
                    .thenReturn(List.of(
                            message(12L, r, me, ChatMsgType.TEXT),  // 세 명 모두 못 읽음 → 3
                            message(7L, r, me, ChatMsgType.TEXT),   // 0,5 두 명 못 읽음 → 2
                            message(3L, r, me, ChatMsgType.TEXT),   // 0 한 명 못 읽음 → 1
                            message(1L, r, me, ChatMsgType.TEXT))); // 0 한 명 못 읽음 → 1

            List<ChatMessageDto> result = chatService.getChatMessages(me, 11L, null, null);

            assertThat(result)
                    .extracting(ChatMessageDto::messageId, ChatMessageDto::unreadCount)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple(1L, 1),
                            org.assertj.core.groups.Tuple.tuple(3L, 1),
                            org.assertj.core.groups.Tuple.tuple(7L, 2),
                            org.assertj.core.groups.Tuple.tuple(12L, 3));
        }

        @Test
        @DisplayName("읽음 위치가 메시지 id와 정확히 같으면 읽은 것으로 센다 — 경계 조건")
        void treatsEqualPositionAsRead() {
            ChatRoom r = groupRoom(12L, me);
            stubRoom(r,
                    participant(r, me, ChatRole.MEMBER, 5L, LocalDateTime.now()),
                    participant(r, friend, ChatRole.MEMBER, 5L, LocalDateTime.now()));
            when(chatMsgRepository.findByRoomIdWithCursor(eq(12L), anyLong(), anyLong(), any()))
                    .thenReturn(List.of(message(5L, r, me, ChatMsgType.TEXT)));

            List<ChatMessageDto> result = chatService.getChatMessages(me, 12L, null, null);

            assertThat(result).singleElement()
                    .satisfies(dto -> assertThat(dto.unreadCount()).isZero());
        }

        @Test
        @DisplayName("참여자가 없는 방(빈 배열)에서도 미읽음 계산이 깨지지 않는다")
        void handlesEmptyReadPositions() {
            ChatRoom r = groupRoom(13L, me);
            ChatParticipants onlyRow = participant(r, me, ChatRole.MEMBER, 0L, LocalDateTime.now());
            when(chatRoomRepository.findById(13L)).thenReturn(Optional.of(r));
            when(chatPTRepository.findByChatRoomAndUser(r, me)).thenReturn(Optional.of(onlyRow));
            when(chatPTRepository.findActiveMembers(r)).thenReturn(List.of());
            when(chatMsgRepository.findByRoomIdWithCursor(eq(13L), anyLong(), anyLong(), any()))
                    .thenReturn(List.of(message(1L, r, me, ChatMsgType.TEXT)));

            List<ChatMessageDto> result = chatService.getChatMessages(me, 13L, null, null);

            assertThat(result).singleElement()
                    .satisfies(dto -> assertThat(dto.unreadCount()).isZero());
        }
    }

    // ==================================================================
    // inviteMembers
    // ==================================================================

    @Nested
    @DisplayName("inviteMembers")
    class InviteMembers {

        private ChatRoom room;
        private ChatParticipants ownerRow;

        @BeforeEach
        void setUp() {
            room = groupRoom(10L, me);
            ownerRow = participant(room, me, ChatRole.OWNER);
            stubRoom(room, ownerRow);
        }

        @Test
        @DisplayName("새 참여자를 MEMBER로 추가하고 입장 하한선을 현재 최신 메시지로 맞춘다")
        void addsNewParticipant() {
            when(chatMsgRepository.findLastMsgIdByRoomId(10L)).thenReturn(30L);
            when(chatPTRepository.findByChatRoomAndUserIds(eq(room), any())).thenReturn(List.of());
            when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(friend));

            List<ChatMemberDto> result = chatService.inviteMembers(me, 10L, List.of(2L));

            ArgumentCaptor<ChatParticipants> captor = ArgumentCaptor.forClass(ChatParticipants.class);
            verify(chatPTRepository).save(captor.capture());
            assertThat(captor.getValue().getRole()).isEqualTo(ChatRole.MEMBER);
            assertThat(captor.getValue().getJoinedMsgId()).isEqualTo(30L);
            assertThat(captor.getValue().getLastReadMsgId()).isEqualTo(30L);
            assertThat(result).hasSize(1);
        }

        @Test
        @DisplayName("나갔던 참여자는 새 행을 만들지 않고 재입장시킨다")
        void rejoinsPreviousParticipant() {
            ChatParticipants leftRow = participant(room, friend, ChatRole.ADMIN);
            leftRow.delete();
            when(chatMsgRepository.findLastMsgIdByRoomId(10L)).thenReturn(30L);
            when(chatPTRepository.findByChatRoomAndUserIds(eq(room), any())).thenReturn(List.of(leftRow));
            when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(friend));

            chatService.inviteMembers(me, 10L, List.of(2L));

            verify(chatPTRepository, never()).save(any());
            assertThat(leftRow.getIsValid()).isTrue();
            assertThat(leftRow.getJoinedMsgId()).isEqualTo(30L);
            // 재입장 시 권한은 MEMBER로 초기화된다 — 이전 ADMIN 권한이 되살아나지 않는다
            assertThat(leftRow.getRole()).isEqualTo(ChatRole.MEMBER);
        }

        @Test
        @DisplayName("이미 참여 중인 사람만 초대하면 CHAT_ALREADY_PARTICIPANT")
        void throwsWhenAllAlreadyParticipants() {
            ChatParticipants activeRow = participant(room, friend, ChatRole.MEMBER);
            when(chatPTRepository.findByChatRoomAndUserIds(eq(room), any())).thenReturn(List.of(activeRow));

            assertThatThrownBy(() -> chatService.inviteMembers(me, 10L, List.of(2L)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_ALREADY_PARTICIPANT));
        }

        @Test
        @DisplayName("일부만 이미 참여 중이면 남은 사람만 초대된다")
        void invitesOnlyMissingMembers() {
            ChatParticipants activeRow = participant(room, friend, ChatRole.MEMBER);
            when(chatPTRepository.findByChatRoomAndUserIds(eq(room), any())).thenReturn(List.of(activeRow));
            when(userRepository.findAllById(List.of(2L, 3L))).thenReturn(List.of(friend, stranger));

            List<ChatMemberDto> result = chatService.inviteMembers(me, 10L, List.of(2L, 3L));

            assertThat(result).hasSize(1);
            assertThat(result.get(0).userId()).isEqualTo(3L);
            verify(chatPTRepository, times(1)).save(any());
        }

        @Test
        @DisplayName("정원을 넘기는 초대는 CHAT_ROOM_FULL — 99명 방에 2명 초대")
        void throwsWhenExceedingCapacity() {
            // 현재 99명, 2명을 초대하면 101명이 되어 두 번째에서 막힌다
            when(chatPTRepository.countByChatRoomAndIsValidTrue(room)).thenReturn(99);
            when(chatPTRepository.findByChatRoomAndUserIds(eq(room), any())).thenReturn(List.of());
            when(userRepository.findAllById(List.of(2L, 3L))).thenReturn(List.of(friend, stranger));

            assertThatThrownBy(() -> chatService.inviteMembers(me, 10L, List.of(2L, 3L)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_ROOM_FULL));
        }

        @Test
        @DisplayName("정원을 정확히 채우는 초대는 통과한다 — 99명 방에 1명")
        void allowsFillingUpToCapacity() {
            when(chatPTRepository.countByChatRoomAndIsValidTrue(room)).thenReturn(99);
            when(chatPTRepository.findByChatRoomAndUserIds(eq(room), any())).thenReturn(List.of());
            when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(friend));

            List<ChatMemberDto> result = chatService.inviteMembers(me, 10L, List.of(2L));

            assertThat(result).hasSize(1);
        }

        @Test
        @DisplayName("PRIVATE 방에는 초대할 수 없다")
        void throwsOnPrivateRoom() {
            ChatRoom pr = privateRoom(20L, 1L, 2L);
            stubRoom(pr, participant(pr, me, ChatRole.MEMBER));

            assertThatThrownBy(() -> chatService.inviteMembers(me, 20L, List.of(3L)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_GROUP_ROOM));
        }

        @Test
        @DisplayName("일반 MEMBER는 초대할 권한이 없다")
        void throwsWhenMemberInvites() {
            ChatRoom r = groupRoom(21L, me);
            stubRoom(r, participant(r, friend, ChatRole.MEMBER));

            assertThatThrownBy(() -> chatService.inviteMembers(friend, 21L, List.of(3L)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NO_PERMISSION));
        }

        @Test
        @DisplayName("ADMIN은 초대할 수 있다")
        void allowsAdminToInvite() {
            ChatRoom r = groupRoom(22L, me);
            stubRoom(r, participant(r, friend, ChatRole.ADMIN));
            when(chatPTRepository.findByChatRoomAndUserIds(eq(r), any())).thenReturn(List.of());
            when(userRepository.findAllById(List.of(3L))).thenReturn(List.of(stranger));

            assertThat(chatService.inviteMembers(friend, 22L, List.of(3L))).hasSize(1);
        }

        @Test
        @DisplayName("자기 자신만 초대하면 CHAT_INVALID_MEMBER_COUNT")
        void throwsWhenOnlySelf() {
            assertThatThrownBy(() -> chatService.inviteMembers(me, 10L, List.of(1L)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_INVALID_MEMBER_COUNT));
        }

        @Test
        @DisplayName("친구가 아닌 사람은 초대할 수 없다")
        void throwsWhenNotFriend() {
            when(friendRepository.findMutualFriendIdsAmong(eq(1L), any())).thenReturn(List.of());

            assertThatThrownBy(() -> chatService.inviteMembers(me, 10L, List.of(3L)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_FRIENDS));
        }

        @Test
        @DisplayName("입장 안내 SYSTEM 메시지와 JOINED 이벤트를 발행한다")
        void writesSystemMessageAndPublishesEvent() {
            when(chatPTRepository.findByChatRoomAndUserIds(eq(room), any())).thenReturn(List.of());
            when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(friend));

            chatService.inviteMembers(me, 10L, List.of(2L));

            ArgumentCaptor<ChatMsg> msgCaptor = ArgumentCaptor.forClass(ChatMsg.class);
            verify(chatMsgRepository).saveAndFlush(msgCaptor.capture());
            assertThat(msgCaptor.getValue().getContent()).isEqualTo("friend님이 들어왔습니다.");

            ArgumentCaptor<ChatMemberEventDto> eventCaptor =
                    ArgumentCaptor.forClass(ChatMemberEventDto.class);
            verify(messagingTemplate).convertAndSend(
                    eq("/topic/chat/room/10/members"), eventCaptor.capture());
            assertThat(eventCaptor.getValue().eventType())
                    .isEqualTo(ChatMemberEventDto.EventType.JOINED);
        }
    }

    // ==================================================================
    // leaveRoom
    // ==================================================================

    @Nested
    @DisplayName("leaveRoom")
    class LeaveRoom {

        @Test
        @DisplayName("일반 멤버가 나가면 참여 행만 soft delete되고 방은 유지된다")
        void softDeletesParticipantOnly() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants myRow = participant(room, me, ChatRole.MEMBER);
            ChatParticipants friendRow = participant(room, friend, ChatRole.MEMBER);
            stubRoom(room, myRow, friendRow);

            chatService.leaveRoom(me, 10L);

            assertThat(myRow.getIsValid()).isFalse();
            assertThat(room.getIsValid()).isTrue();
            assertThat(friendRow.getRole()).isEqualTo(ChatRole.MEMBER);
        }

        @Test
        @DisplayName("마지막 참여자가 나가면 방도 닫히고 멤버 이벤트는 발행하지 않는다")
        void closesRoomWhenLastParticipantLeaves() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants myRow = participant(room, me, ChatRole.OWNER);
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me)).thenReturn(Optional.of(myRow));
            when(chatPTRepository.findActiveMembers(room)).thenReturn(List.of());

            chatService.leaveRoom(me, 10L);

            assertThat(room.getIsValid()).isFalse();
            verify(messagingTemplate, never()).convertAndSend(
                    eq("/topic/chat/room/10/members"), any(Object.class));
        }

        @Test
        @DisplayName("방장이 나가면 ADMIN에게 우선 승계된다")
        void promotesAdminWhenOwnerLeaves() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants ownerRow = participant(room, me, ChatRole.OWNER);
            ChatParticipants oldestMember =
                    participant(room, stranger, ChatRole.MEMBER, 0L, LocalDateTime.now().minusDays(2));
            ChatParticipants admin =
                    participant(room, friend, ChatRole.ADMIN, 0L, LocalDateTime.now().minusDays(1));
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me)).thenReturn(Optional.of(ownerRow));
            // joinedAt 오름차순 — 가장 오래된 멤버가 먼저 온다
            when(chatPTRepository.findActiveMembers(room)).thenReturn(List.of(oldestMember, admin));

            chatService.leaveRoom(me, 10L);

            assertThat(admin.getRole()).isEqualTo(ChatRole.OWNER);
            assertThat(oldestMember.getRole()).isEqualTo(ChatRole.MEMBER);
            assertThat(room.getOwner()).isSameAs(friend);
        }

        @Test
        @DisplayName("ADMIN이 없으면 가장 오래된 멤버가 방장을 잇는다")
        void promotesOldestMemberWhenNoAdmin() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants ownerRow = participant(room, me, ChatRole.OWNER);
            ChatParticipants oldest =
                    participant(room, friend, ChatRole.MEMBER, 0L, LocalDateTime.now().minusDays(2));
            ChatParticipants newer =
                    participant(room, stranger, ChatRole.MEMBER, 0L, LocalDateTime.now().minusDays(1));
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me)).thenReturn(Optional.of(ownerRow));
            when(chatPTRepository.findActiveMembers(room)).thenReturn(List.of(oldest, newer));

            chatService.leaveRoom(me, 10L);

            assertThat(oldest.getRole()).isEqualTo(ChatRole.OWNER);
            assertThat(newer.getRole()).isEqualTo(ChatRole.MEMBER);
            assertThat(room.getOwner()).isSameAs(friend);
        }

        @Test
        @DisplayName("일반 멤버가 나갈 때는 방장이 바뀌지 않는다")
        void doesNotChangeOwnerWhenMemberLeaves() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants ownerRow = participant(room, friend, ChatRole.OWNER);
            ChatParticipants myRow = participant(room, me, ChatRole.MEMBER);
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me)).thenReturn(Optional.of(myRow));
            when(chatPTRepository.findActiveMembers(room)).thenReturn(List.of(ownerRow));

            chatService.leaveRoom(me, 10L);

            assertThat(ownerRow.getRole()).isEqualTo(ChatRole.OWNER);
            assertThat(room.getOwner()).isSameAs(me); // groupRoom(10L, me)에서 설정한 원래 값
        }

        @Test
        @DisplayName("LEFT 이벤트에 새 방장 id가 담긴다")
        void publishesLeftEventWithNewOwner() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants ownerRow = participant(room, me, ChatRole.OWNER);
            ChatParticipants successor = participant(room, friend, ChatRole.MEMBER);
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me)).thenReturn(Optional.of(ownerRow));
            when(chatPTRepository.findActiveMembers(room)).thenReturn(List.of(successor));

            chatService.leaveRoom(me, 10L);

            ArgumentCaptor<ChatMemberEventDto> captor =
                    ArgumentCaptor.forClass(ChatMemberEventDto.class);
            verify(messagingTemplate).convertAndSend(
                    eq("/topic/chat/room/10/members"), captor.capture());
            assertThat(captor.getValue().eventType()).isEqualTo(ChatMemberEventDto.EventType.LEFT);
            assertThat(captor.getValue().newOwnerId()).isEqualTo(2L);
            assertThat(captor.getValue().targets()).extracting(ChatMemberDto::userId)
                    .containsExactly(1L);
        }

        @Test
        @DisplayName("참여자가 아니면 CHAT_NOT_PARTICIPANT")
        void throwsWhenNotParticipant() {
            ChatRoom room = groupRoom(10L, me);
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, stranger)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> chatService.leaveRoom(stranger, 10L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_PARTICIPANT));
        }

        @Test
        @DisplayName("PRIVATE 방도 나갈 수 있다 — 단체방 제약을 적용하지 않는다")
        void allowsLeavingPrivateRoom() {
            ChatRoom room = privateRoom(20L, 1L, 2L);
            ChatParticipants myRow = participant(room, me, ChatRole.MEMBER);
            ChatParticipants friendRow = participant(room, friend, ChatRole.MEMBER);
            stubRoom(room, myRow, friendRow);

            chatService.leaveRoom(me, 20L);

            assertThat(myRow.getIsValid()).isFalse();
        }
    }

    // ==================================================================
    // kickMember — 권한 매트릭스
    // ==================================================================

    @Nested
    @DisplayName("kickMember")
    class KickMember {

        @Test
        @DisplayName("OWNER는 MEMBER를 내보낼 수 있다")
        void ownerKicksMember() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants ownerRow = participant(room, me, ChatRole.OWNER);
            ChatParticipants targetRow = participant(room, friend, ChatRole.MEMBER);
            stubRoom(room, ownerRow, targetRow);

            chatService.kickMember(me, 10L, 2L);

            assertThat(targetRow.getIsValid()).isFalse();
        }

        @Test
        @DisplayName("ADMIN은 MEMBER를 내보낼 수 있다")
        void adminKicksMember() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants adminRow = participant(room, me, ChatRole.ADMIN);
            ChatParticipants targetRow = participant(room, friend, ChatRole.MEMBER);
            stubRoom(room, adminRow, targetRow);

            chatService.kickMember(me, 10L, 2L);

            assertThat(targetRow.getIsValid()).isFalse();
        }

        @Test
        @DisplayName("OWNER는 ADMIN도 내보낼 수 있다")
        void ownerKicksAdmin() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants ownerRow = participant(room, me, ChatRole.OWNER);
            ChatParticipants targetRow = participant(room, friend, ChatRole.ADMIN);
            stubRoom(room, ownerRow, targetRow);

            chatService.kickMember(me, 10L, 2L);

            assertThat(targetRow.getIsValid()).isFalse();
        }

        @Test
        @DisplayName("ADMIN은 다른 ADMIN을 내보낼 수 없다")
        void adminCannotKickAdmin() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants adminRow = participant(room, me, ChatRole.ADMIN);
            ChatParticipants targetRow = participant(room, friend, ChatRole.ADMIN);
            stubRoom(room, adminRow, targetRow);

            assertThatThrownBy(() -> chatService.kickMember(me, 10L, 2L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NO_PERMISSION));

            assertThat(targetRow.getIsValid()).isTrue();
        }

        @Test
        @DisplayName("MEMBER는 아무도 내보낼 수 없다")
        void memberCannotKick() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants memberRow = participant(room, me, ChatRole.MEMBER);
            ChatParticipants targetRow = participant(room, friend, ChatRole.MEMBER);
            stubRoom(room, memberRow, targetRow);

            assertThatThrownBy(() -> chatService.kickMember(me, 10L, 2L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NO_PERMISSION));

            assertThat(targetRow.getIsValid()).isTrue();
        }

        @Test
        @DisplayName("OWNER는 내보낼 수 없다 — 방장은 나가기로만 빠진다")
        void cannotKickOwner() {
            ChatRoom room = groupRoom(10L, friend);
            ChatParticipants adminRow = participant(room, me, ChatRole.ADMIN);
            ChatParticipants ownerRow = participant(room, friend, ChatRole.OWNER);
            stubRoom(room, adminRow, ownerRow);

            assertThatThrownBy(() -> chatService.kickMember(me, 10L, 2L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_CANNOT_KICK_OWNER));

            assertThat(ownerRow.getIsValid()).isTrue();
        }

        @Test
        @DisplayName("자기 자신은 내보낼 수 없다")
        void cannotKickSelf() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants ownerRow = participant(room, me, ChatRole.OWNER);
            stubRoom(room, ownerRow);

            assertThatThrownBy(() -> chatService.kickMember(me, 10L, 1L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_CANNOT_KICK_SELF));
        }

        @Test
        @DisplayName("PRIVATE 방에서는 강퇴가 불가능하다")
        void cannotKickInPrivateRoom() {
            ChatRoom room = privateRoom(20L, 1L, 2L);
            stubRoom(room,
                    participant(room, me, ChatRole.MEMBER),
                    participant(room, friend, ChatRole.MEMBER));

            assertThatThrownBy(() -> chatService.kickMember(me, 20L, 2L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_GROUP_ROOM));
        }

        @Test
        @DisplayName("대상 유저가 없으면 USER_NOT_FOUND")
        void throwsWhenTargetUserMissing() {
            ChatRoom room = groupRoom(10L, me);
            stubRoom(room, participant(room, me, ChatRole.OWNER));
            when(userRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> chatService.kickMember(me, 10L, 99L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.USER_NOT_FOUND));
        }

        @Test
        @DisplayName("이미 나간 사람은 강퇴할 수 없다")
        void throwsWhenTargetAlreadyLeft() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants leftRow = participant(room, friend, ChatRole.MEMBER);
            leftRow.delete();
            stubRoom(room, participant(room, me, ChatRole.OWNER), leftRow);

            assertThatThrownBy(() -> chatService.kickMember(me, 10L, 2L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_PARTICIPANT));
        }

        @Test
        @DisplayName("KICKED 이벤트와 안내 메시지를 남긴다")
        void publishesKickedEvent() {
            ChatRoom room = groupRoom(10L, me);
            stubRoom(room,
                    participant(room, me, ChatRole.OWNER),
                    participant(room, friend, ChatRole.MEMBER));

            chatService.kickMember(me, 10L, 2L);

            ArgumentCaptor<ChatMsg> msgCaptor = ArgumentCaptor.forClass(ChatMsg.class);
            verify(chatMsgRepository).saveAndFlush(msgCaptor.capture());
            assertThat(msgCaptor.getValue().getContent()).isEqualTo("friend님이 내보내졌습니다.");

            ArgumentCaptor<ChatMemberEventDto> eventCaptor =
                    ArgumentCaptor.forClass(ChatMemberEventDto.class);
            verify(messagingTemplate).convertAndSend(
                    eq("/topic/chat/room/10/members"), eventCaptor.capture());
            assertThat(eventCaptor.getValue().eventType())
                    .isEqualTo(ChatMemberEventDto.EventType.KICKED);
        }
    }

    // ==================================================================
    // updateRoomName
    // ==================================================================

    @Nested
    @DisplayName("updateRoomName")
    class UpdateRoomName {

        private ChatRoom room;

        @BeforeEach
        void setUp() {
            room = groupRoom(10L, me);
            stubRoom(room, participant(room, me, ChatRole.OWNER));
        }

        @Test
        @DisplayName("정상 변경 시 이름이 바뀌고 ROOM_RENAMED 이벤트가 발행된다")
        void updatesName() {
            chatService.updateRoomName(me, 10L, "새 이름");

            assertThat(room.getName()).isEqualTo("새 이름");

            ArgumentCaptor<ChatMemberEventDto> captor =
                    ArgumentCaptor.forClass(ChatMemberEventDto.class);
            verify(messagingTemplate).convertAndSend(
                    eq("/topic/chat/room/10/members"), captor.capture());
            assertThat(captor.getValue().eventType())
                    .isEqualTo(ChatMemberEventDto.EventType.ROOM_RENAMED);
            assertThat(captor.getValue().roomName()).isEqualTo("새 이름");
        }

        @Test
        @DisplayName("앞뒤 공백은 잘라서 저장한다")
        void trimsName() {
            chatService.updateRoomName(me, 10L, "  새 이름  ");

            assertThat(room.getName()).isEqualTo("새 이름");
        }

        @ParameterizedTest
        @ValueSource(strings = {"", "   ", "\t"})
        @DisplayName("빈 이름은 CHAT_INVALID_ROOM_NAME")
        void rejectsBlankName(String rawName) {
            assertThatThrownBy(() -> chatService.updateRoomName(me, 10L, rawName))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_INVALID_ROOM_NAME));

            assertThat(room.getName()).isEqualTo("단체방");
        }

        @Test
        @DisplayName("null 이름은 CHAT_INVALID_ROOM_NAME")
        void rejectsNullName() {
            assertThatThrownBy(() -> chatService.updateRoomName(me, 10L, null))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_INVALID_ROOM_NAME));
        }

        @Test
        @DisplayName("30자는 허용된다 — 상한 경계")
        void allowsExactlyMaxLength() {
            String name = "가".repeat(30);

            chatService.updateRoomName(me, 10L, name);

            assertThat(room.getName()).isEqualTo(name);
        }

        @Test
        @DisplayName("31자는 CHAT_INVALID_ROOM_NAME — 생성과 달리 자르지 않고 거부한다")
        void rejectsOverMaxLength() {
            assertThatThrownBy(() -> chatService.updateRoomName(me, 10L, "가".repeat(31)))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_INVALID_ROOM_NAME));

            assertThat(room.getName()).isEqualTo("단체방");
        }

        @Test
        @DisplayName("MEMBER는 이름을 바꿀 수 없다")
        void throwsWhenMemberRenames() {
            ChatRoom r = groupRoom(11L, me);
            stubRoom(r, participant(r, friend, ChatRole.MEMBER));

            assertThatThrownBy(() -> chatService.updateRoomName(friend, 11L, "새 이름"))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NO_PERMISSION));
        }

        @Test
        @DisplayName("PRIVATE 방은 이름을 바꿀 수 없다")
        void throwsOnPrivateRoom() {
            ChatRoom pr = privateRoom(20L, 1L, 2L);
            stubRoom(pr, participant(pr, me, ChatRole.MEMBER));

            assertThatThrownBy(() -> chatService.updateRoomName(me, 20L, "새 이름"))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_GROUP_ROOM));
        }
    }

    // ==================================================================
    // changeRole
    // ==================================================================

    @Nested
    @DisplayName("changeRole")
    class ChangeRole {

        @Test
        @DisplayName("OWNER는 MEMBER를 ADMIN으로 올릴 수 있다")
        void ownerPromotesMemberToAdmin() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants targetRow = participant(room, friend, ChatRole.MEMBER);
            stubRoom(room, participant(room, me, ChatRole.OWNER), targetRow);

            chatService.changeRole(me, 10L, 2L, ChatRole.ADMIN);

            assertThat(targetRow.getRole()).isEqualTo(ChatRole.ADMIN);
        }

        @Test
        @DisplayName("OWNER는 ADMIN을 MEMBER로 내릴 수 있다")
        void ownerDemotesAdminToMember() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants targetRow = participant(room, friend, ChatRole.ADMIN);
            stubRoom(room, participant(room, me, ChatRole.OWNER), targetRow);

            chatService.changeRole(me, 10L, 2L, ChatRole.MEMBER);

            assertThat(targetRow.getRole()).isEqualTo(ChatRole.MEMBER);
        }

        @Test
        @DisplayName("ADMIN은 권한을 바꿀 수 없다 — OWNER만 가능")
        void adminCannotChangeRole() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants targetRow = participant(room, stranger, ChatRole.MEMBER);
            stubRoom(room, participant(room, me, ChatRole.ADMIN), targetRow);

            assertThatThrownBy(() -> chatService.changeRole(me, 10L, 3L, ChatRole.ADMIN))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NO_PERMISSION));

            assertThat(targetRow.getRole()).isEqualTo(ChatRole.MEMBER);
        }

        @Test
        @DisplayName("OWNER 권한을 넘기는 것은 이 메서드로 할 수 없다")
        void cannotAssignOwnerRole() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants targetRow = participant(room, friend, ChatRole.MEMBER);
            stubRoom(room, participant(room, me, ChatRole.OWNER), targetRow);

            assertThatThrownBy(() -> chatService.changeRole(me, 10L, 2L, ChatRole.OWNER))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NO_PERMISSION));

            assertThat(targetRow.getRole()).isEqualTo(ChatRole.MEMBER);
        }

        @Test
        @DisplayName("자기 권한은 바꿀 수 없다")
        void cannotChangeOwnRole() {
            ChatRoom room = groupRoom(10L, me);
            stubRoom(room, participant(room, me, ChatRole.OWNER));

            assertThatThrownBy(() -> chatService.changeRole(me, 10L, 1L, ChatRole.MEMBER))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NO_PERMISSION));
        }

        @Test
        @DisplayName("PRIVATE 방에는 권한 개념이 없다")
        void throwsOnPrivateRoom() {
            ChatRoom pr = privateRoom(20L, 1L, 2L);
            stubRoom(pr,
                    participant(pr, me, ChatRole.MEMBER),
                    participant(pr, friend, ChatRole.MEMBER));

            assertThatThrownBy(() -> chatService.changeRole(me, 20L, 2L, ChatRole.ADMIN))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_GROUP_ROOM));
        }

        @Test
        @DisplayName("이미 나간 사람의 권한은 바꿀 수 없다")
        void throwsWhenTargetLeft() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants leftRow = participant(room, friend, ChatRole.MEMBER);
            leftRow.delete();
            stubRoom(room, participant(room, me, ChatRole.OWNER), leftRow);

            assertThatThrownBy(() -> chatService.changeRole(me, 10L, 2L, ChatRole.ADMIN))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_PARTICIPANT));
        }

        @Test
        @DisplayName("ROLE_CHANGED 이벤트를 발행한다")
        void publishesRoleChangedEvent() {
            ChatRoom room = groupRoom(10L, me);
            stubRoom(room,
                    participant(room, me, ChatRole.OWNER),
                    participant(room, friend, ChatRole.MEMBER));

            chatService.changeRole(me, 10L, 2L, ChatRole.ADMIN);

            ArgumentCaptor<ChatMemberEventDto> captor =
                    ArgumentCaptor.forClass(ChatMemberEventDto.class);
            verify(messagingTemplate).convertAndSend(
                    eq("/topic/chat/room/10/members"), captor.capture());
            assertThat(captor.getValue().eventType())
                    .isEqualTo(ChatMemberEventDto.EventType.ROLE_CHANGED);
            assertThat(captor.getValue().targets()).extracting(ChatMemberDto::role)
                    .containsExactly(ChatRole.ADMIN);
        }
    }

    // ==================================================================
    // 목록 조회
    // ==================================================================

    @Nested
    @DisplayName("getChatRoomList")
    class GetChatRoomList {

        @Test
        @DisplayName("참여 중인 방이 없으면 빈 목록")
        void returnsEmptyWhenNoRooms() {
            when(chatPTRepository.findMyRooms(me)).thenReturn(List.of());

            assertThat(chatService.getChatRoomList(me)).isEmpty();
            verify(chatMsgRepository, never()).countUnreadByUserId(anyLong());
        }

        @Test
        @DisplayName("최근 대화 순으로 정렬되고 대화 없는 방은 뒤로 밀린다")
        void sortsByLastMessageAtDescendingWithNullsLast() {
            ChatRoom older = groupRoom(1L, me);
            ChatRoom newer = groupRoom(2L, me);
            ChatRoom never = groupRoom(3L, me);
            older.setUpdatedDate(LocalDateTime.now().minusHours(2));
            newer.setUpdatedDate(LocalDateTime.now().minusMinutes(5));
            // never 는 updatedDate/created 모두 null

            List<ChatParticipants> myRows = List.of(
                    participant(older, me, ChatRole.MEMBER),
                    participant(newer, me, ChatRole.MEMBER),
                    participant(never, me, ChatRole.MEMBER));
            when(chatPTRepository.findMyRooms(me)).thenReturn(myRows);
            when(chatMsgRepository.countUnreadByUserId(1L)).thenReturn(List.of());
            when(chatPTRepository.findActiveMembersByRoomIds(any())).thenReturn(myRows);

            List<ChatRoomDto> result = chatService.getChatRoomList(me);

            assertThat(result).extracting(ChatRoomDto::roomId).containsExactly(2L, 1L, 3L);
        }

        @Test
        @DisplayName("안읽음 수는 방별로 매핑되고 없으면 0")
        void mapsUnreadCountsPerRoom() {
            ChatRoom roomA = groupRoom(1L, me);
            ChatRoom roomB = groupRoom(2L, me);
            roomA.setUpdatedDate(LocalDateTime.now().minusMinutes(1));
            roomB.setUpdatedDate(LocalDateTime.now().minusMinutes(2));

            List<ChatParticipants> myRows = List.of(
                    participant(roomA, me, ChatRole.MEMBER),
                    participant(roomB, me, ChatRole.MEMBER));
            when(chatPTRepository.findMyRooms(me)).thenReturn(myRows);
            when(chatMsgRepository.countUnreadByUserId(1L)).thenReturn(List.of(unread(1L, 7L)));
            when(chatPTRepository.findActiveMembersByRoomIds(any())).thenReturn(myRows);

            List<ChatRoomDto> result = chatService.getChatRoomList(me);

            assertThat(result).extracting(ChatRoomDto::roomId, ChatRoomDto::unreadCount)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple(1L, 7),
                            org.assertj.core.groups.Tuple.tuple(2L, 0));
        }

        @Test
        @DisplayName("안읽음 수가 null로 오면 0으로 읽는다 — LEFT JOIN 결과 방어")
        void treatsNullUnreadCountAsZero() {
            ChatRoom room = groupRoom(1L, me);
            List<ChatParticipants> myRows = List.of(participant(room, me, ChatRole.MEMBER));
            when(chatPTRepository.findMyRooms(me)).thenReturn(myRows);
            when(chatMsgRepository.countUnreadByUserId(1L)).thenReturn(List.of(unread(1L, null)));
            when(chatPTRepository.findActiveMembersByRoomIds(any())).thenReturn(myRows);

            assertThat(chatService.getChatRoomList(me)).singleElement()
                    .satisfies(dto -> assertThat(dto.unreadCount()).isZero());
        }

        @Test
        @DisplayName("PRIVATE 방 이름은 상대 닉네임으로 조립된다")
        void resolvesPrivateRoomNameFromCounterpart() {
            ChatRoom room = privateRoom(1L, 1L, 2L);
            List<ChatParticipants> members = List.of(
                    participant(room, me, ChatRole.MEMBER),
                    participant(room, friend, ChatRole.MEMBER));
            when(chatPTRepository.findMyRooms(me)).thenReturn(List.of(members.get(0)));
            when(chatMsgRepository.countUnreadByUserId(1L)).thenReturn(List.of());
            when(chatPTRepository.findActiveMembersByRoomIds(any())).thenReturn(members);

            assertThat(chatService.getChatRoomList(me)).singleElement()
                    .satisfies(dto -> assertThat(dto.roomName()).isEqualTo("friend"));
        }

        @Test
        @DisplayName("상대가 나간 PRIVATE 방 이름은 '알 수 없음'")
        void fallsBackWhenCounterpartGone() {
            ChatRoom room = privateRoom(1L, 1L, 2L);
            ChatParticipants myRow = participant(room, me, ChatRole.MEMBER);
            when(chatPTRepository.findMyRooms(me)).thenReturn(List.of(myRow));
            when(chatMsgRepository.countUnreadByUserId(1L)).thenReturn(List.of());
            when(chatPTRepository.findActiveMembersByRoomIds(any())).thenReturn(List.of(myRow));

            assertThat(chatService.getChatRoomList(me)).singleElement()
                    .satisfies(dto -> assertThat(dto.roomName()).isEqualTo("알 수 없음"));
        }

        @Test
        @DisplayName("미리보기 멤버는 나를 뺀 최대 4명이고 memberCount는 전체 인원이다")
        void limitsPreviewMembersToFour() {
            ChatRoom room = groupRoom(1L, me);
            List<ChatParticipants> members = new ArrayList<>();
            members.add(participant(room, me, ChatRole.OWNER));
            for (long id = 2; id <= 8; id++) {
                members.add(participant(room, user(id, "u" + id), ChatRole.MEMBER));
            }
            when(chatPTRepository.findMyRooms(me)).thenReturn(List.of(members.get(0)));
            when(chatMsgRepository.countUnreadByUserId(1L)).thenReturn(List.of());
            when(chatPTRepository.findActiveMembersByRoomIds(any())).thenReturn(members);

            ChatRoomDto dto = chatService.getChatRoomList(me).get(0);

            assertThat(dto.members()).hasSize(4);
            assertThat(dto.members()).extracting(ChatMemberDto::userId).doesNotContain(1L);
            assertThat(dto.memberCount()).isEqualTo(8);
        }

        @Test
        @DisplayName("내 참여 정보로 myRole과 알림 설정을 채운다")
        void fillsMyRoleAndNotification() {
            ChatRoom room = groupRoom(1L, me);
            ChatParticipants myRow = ChatParticipants.builder()
                    .user(me).chatRoom(room).role(ChatRole.ADMIN)
                    .joinedAt(LocalDateTime.now()).joinedMsgId(0L)
                    .lastReadMsgId(0L).lastReadDate(LocalDateTime.now())
                    .notificationEnabled(false)
                    .build();
            when(chatPTRepository.findMyRooms(me)).thenReturn(List.of(myRow));
            when(chatMsgRepository.countUnreadByUserId(1L)).thenReturn(List.of());
            when(chatPTRepository.findActiveMembersByRoomIds(any())).thenReturn(List.of(myRow));

            ChatRoomDto dto = chatService.getChatRoomList(me).get(0);

            assertThat(dto.myRole()).isEqualTo(ChatRole.ADMIN);
            assertThat(dto.notificationEnabled()).isFalse();
        }
    }

    @Nested
    @DisplayName("getMembers / getReadStatus")
    class MemberQueries {

        @Test
        @DisplayName("멤버 목록에 열람자 기준 관계가 채워진다")
        void attachesRelationToEachMember() {
            ChatRoom room = groupRoom(10L, me);
            stubRoom(room,
                    participant(room, me, ChatRole.OWNER),
                    participant(room, friend, ChatRole.MEMBER));
            when(friendService.getRelations(eq(1L), any()))
                    .thenReturn(Map.of(1L, RelationStatus.SELF, 2L, RelationStatus.FRIEND));

            List<ChatMemberDto> result = chatService.getMembers(me, 10L);

            assertThat(result)
                    .extracting(ChatMemberDto::userId, ChatMemberDto::relation)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple(1L, RelationStatus.SELF),
                            org.assertj.core.groups.Tuple.tuple(2L, RelationStatus.FRIEND));
        }

        @Test
        @DisplayName("관계 조회는 인원 수와 무관하게 한 번만 호출된다 — N+1 회귀 방지")
        void queriesRelationsOnce() {
            ChatRoom room = groupRoom(10L, me);
            stubRoom(room,
                    participant(room, me, ChatRole.OWNER),
                    participant(room, friend, ChatRole.MEMBER),
                    participant(room, stranger, ChatRole.MEMBER));

            chatService.getMembers(me, 10L);

            verify(friendService, times(1)).getRelations(eq(1L), any());
        }

        @Test
        @DisplayName("getReadStatus는 멤버별 읽음 위치를 담아 내려준다")
        void exposesLastReadPositions() {
            ChatRoom room = groupRoom(10L, me);
            stubRoom(room,
                    participant(room, me, ChatRole.OWNER, 10L, LocalDateTime.now()),
                    participant(room, friend, ChatRole.MEMBER, 4L, LocalDateTime.now()));

            List<ChatMemberDto> result = chatService.getReadStatus(me, 10L);

            assertThat(result)
                    .extracting(ChatMemberDto::userId, ChatMemberDto::lastReadMsgId)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple(1L, 10L),
                            org.assertj.core.groups.Tuple.tuple(2L, 4L));
        }

        @Test
        @DisplayName("참여자가 아니면 멤버 목록을 볼 수 없다")
        void throwsWhenNotParticipant() {
            ChatRoom room = groupRoom(10L, me);
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, stranger)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> chatService.getMembers(stranger, 10L))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_PARTICIPANT));
        }
    }

    @Nested
    @DisplayName("getRoomDetail")
    class GetRoomDetail {

        @Test
        @DisplayName("해당 방의 안읽음 수만 골라 담는다")
        void picksUnreadCountForRequestedRoom() {
            ChatRoom room = groupRoom(10L, me);
            stubRoom(room, participant(room, me, ChatRole.OWNER));
            when(chatMsgRepository.countUnreadByUserId(1L))
                    .thenReturn(List.of(unread(99L, 3L), unread(10L, 5L)));

            ChatRoomDto result = chatService.getRoomDetail(me, 10L);

            assertThat(result.unreadCount()).isEqualTo(5);
        }

        @Test
        @DisplayName("집계 결과에 방이 없으면 0")
        void defaultsToZeroWhenRoomAbsentFromAggregate() {
            ChatRoom room = groupRoom(10L, me);
            stubRoom(room, participant(room, me, ChatRole.OWNER));
            when(chatMsgRepository.countUnreadByUserId(1L)).thenReturn(List.of(unread(99L, 3L)));

            assertThat(chatService.getRoomDetail(me, 10L).unreadCount()).isZero();
        }
    }

    @Nested
    @DisplayName("updateNotification")
    class UpdateNotification {

        @Test
        @DisplayName("알림 설정을 끌 수 있다")
        void disablesNotification() {
            ChatRoom room = groupRoom(10L, me);
            ChatParticipants myRow = participant(room, me, ChatRole.MEMBER);
            stubRoom(room, myRow);

            chatService.updateNotification(me, 10L, false);

            assertThat(myRow.isNotificationEnabled()).isFalse();
        }

        @Test
        @DisplayName("참여자가 아니면 CHAT_NOT_PARTICIPANT")
        void throwsWhenNotParticipant() {
            ChatRoom room = groupRoom(10L, me);
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, stranger)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> chatService.updateNotification(stranger, 10L, false))
                    .satisfies(ex -> assertErrorCode(ex, ErrorCode.CHAT_NOT_PARTICIPANT));
        }
    }
}
