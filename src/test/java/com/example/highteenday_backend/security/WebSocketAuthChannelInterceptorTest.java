package com.example.highteenday_backend.security;

import com.example.highteenday_backend.domain.chat.ChatPTRepository;
import com.example.highteenday_backend.domain.chat.ChatParticipants;
import com.example.highteenday_backend.domain.chat.ChatRoom;
import com.example.highteenday_backend.domain.chat.ChatRoomRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.enums.ChatRole;
import com.example.highteenday_backend.enums.ChatRoomCategory;
import com.example.highteenday_backend.enums.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WebSocketAuthChannelInterceptorTest {

    @Mock private ChatPTRepository chatPTRepository;
    @Mock private ChatRoomRepository chatRoomRepository;
    @Mock private MessageChannel channel;

    @InjectMocks private WebSocketAuthChannelInterceptor interceptor;

    private User me;
    private ChatRoom room;

    @BeforeEach
    void setUp() {
        me = User.builder()
                .id(1L)
                .email(new Email("me@test.com"))
                .name(new UserName("이름1"))
                .nickname(new Nickname("me"))
                .role(Role.USER)
                .build();
        room = ChatRoom.builder()
                .id(10L)
                .category(ChatRoomCategory.GROUP)
                .name("단체방")
                .build();
    }

    private static Authentication authFor(User user) {
        CustomUserPrincipal principal = new CustomUserPrincipal(user);
        return new UsernamePasswordAuthenticationToken(
                principal, null, principal.getAuthorities());
    }

    private Message<?> connectMessage(Authentication auth) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        Map<String, Object> sessionAttrs = new HashMap<>();
        if (auth != null) sessionAttrs.put("authentication", auth);
        accessor.setSessionAttributes(sessionAttrs);
        accessor.setLeaveMutable(true);
        return org.springframework.messaging.support.MessageBuilder
                .createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private Message<?> subscribeMessage(String destination, Authentication auth) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination(destination);
        if (auth != null) accessor.setUser(auth);
        accessor.setLeaveMutable(true);
        return org.springframework.messaging.support.MessageBuilder
                .createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private static ChatParticipants participant(ChatRoom room, User user, boolean valid) {
        ChatParticipants p = ChatParticipants.builder()
                .user(user)
                .chatRoom(room)
                .role(ChatRole.MEMBER)
                .joinedAt(LocalDateTime.now())
                .joinedMsgId(0L)
                .lastReadMsgId(0L)
                .lastReadDate(LocalDateTime.now())
                .notificationEnabled(true)
                .build();
        if (!valid) p.delete();
        return p;
    }

    @Nested
    @DisplayName("CONNECT")
    class Connect {

        @Test
        @DisplayName("세션에 담긴 인증으로 STOMP 사용자를 설정한다")
        void setsUserFromSessionAttributes() {
            Message<?> message = interceptor.preSend(connectMessage(authFor(me)), channel);

            StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
            assertThat(accessor.getUser()).isInstanceOf(WebSocketUserPrincipal.class);
            // getName()이 userId 문자열이어야 한다. convertAndSendToUser 의 목적지 해석이 이 값에 걸린다.
            assertThat(accessor.getUser().getName()).isEqualTo("1");
        }

        @Test
        @DisplayName("STOMP Principal 이름은 실명이 아니라 userId다 — 사용자 목적지 충돌 방지")
        void principalNameIsUserIdNotRealName() {
            Message<?> message = interceptor.preSend(connectMessage(authFor(me)), channel);

            assertThat(StompHeaderAccessor.wrap(message).getUser().getName())
                    .isEqualTo("1")
                    .isNotEqualTo(me.getNameValue());
        }

        @Test
        @DisplayName("세션에 인증이 없으면 사용자를 설정하지 않고 통과시킨다")
        void passesThroughWithoutAuthentication() {
            Message<?> message = interceptor.preSend(connectMessage(null), channel);

            assertThat(StompHeaderAccessor.wrap(message).getUser()).isNull();
        }

        @Test
        @DisplayName("CONNECT 단계에서는 방 참여 여부를 조회하지 않는다")
        void doesNotCheckRoomMembership() {
            interceptor.preSend(connectMessage(authFor(me)), channel);

            verify(chatRoomRepository, never()).findById(anyLong());
            verify(chatPTRepository, never()).findByChatRoomAndUser(any(), any());
        }
    }

    @Nested
    @DisplayName("SUBSCRIBE — 채팅방 구독 인가")
    class Subscribe {

        @Test
        @DisplayName("참여 중인 방은 구독할 수 있다")
        void allowsParticipant() {
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me))
                    .thenReturn(Optional.of(participant(room, me, true)));

            assertThatCode(() -> interceptor.preSend(
                    subscribeMessage("/topic/chat/room/10", authFor(me)), channel))
                    .doesNotThrowAnyException();
        }

        @ParameterizedTest
        @ValueSource(strings = {
                "/topic/chat/room/10",
                "/topic/chat/room/10/read",
                "/topic/chat/room/10/members"
        })
        @DisplayName("방 하위 토픽 전부에 인가 검사가 걸린다")
        void checksAuthorizationForAllRoomSubtopics(String destination) {
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> interceptor.preSend(
                    subscribeMessage(destination, authFor(me)), channel))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("참가자가 아닙니다");
        }

        @Test
        @DisplayName("참여자가 아니면 구독을 막는다")
        void rejectsNonParticipant() {
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> interceptor.preSend(
                    subscribeMessage("/topic/chat/room/10", authFor(me)), channel))
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("없는 방은 구독을 막는다")
        void rejectsMissingRoom() {
            when(chatRoomRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> interceptor.preSend(
                    subscribeMessage("/topic/chat/room/99", authFor(me)), channel))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("채팅방을 찾을 수 없습니다");
        }

        @Test
        @DisplayName("인증되지 않은 구독은 막는다")
        void rejectsUnauthenticated() {
            assertThatThrownBy(() -> interceptor.preSend(
                    subscribeMessage("/topic/chat/room/10", null), channel))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("인증되지 않은");
        }

        @Test
        @DisplayName("채팅방과 무관한 토픽은 인가 검사를 하지 않는다")
        void skipsCheckForUnrelatedDestinations() {
            interceptor.preSend(subscribeMessage("/topic/notifications", authFor(me)), channel);

            verify(chatRoomRepository, never()).findById(anyLong());
        }

        @Test
        @DisplayName("destination이 없으면 통과시킨다")
        void passesThroughWithoutDestination() {
            assertThatCode(() -> interceptor.preSend(
                    subscribeMessage(null, authFor(me)), channel))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("방 번호가 숫자가 아니면 인가 검사를 하지 않는다")
        void ignoresNonNumericRoomId() {
            interceptor.preSend(subscribeMessage("/topic/chat/room/abc", authFor(me)), channel);

            verify(chatRoomRepository, never()).findById(anyLong());
        }
    }

    @Nested
    @DisplayName("나간 참여자 / 삭제된 방")
    class StaleMembership {

        @Test
        @DisplayName("방을 나간 사람의 구독은 막는다")
        void rejectsMemberWhoLeft() {
            // 판정 기준이 ChatService.requireParticipant 와 같아야 한다. isValid 필터가 없으면
            // 나간 사람이 방 토픽을 계속 받아본다.
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me))
                    .thenReturn(Optional.of(participant(room, me, false)));

            assertThatThrownBy(() -> interceptor.preSend(
                    subscribeMessage("/topic/chat/room/10", authFor(me)), channel))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("참가자가 아닙니다");
        }

        @Test
        @DisplayName("삭제된 방의 구독은 막는다")
        void rejectsDeletedRoom() {
            room.delete();
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me))
                    .thenReturn(Optional.of(participant(room, me, true)));

            assertThatThrownBy(() -> interceptor.preSend(
                    subscribeMessage("/topic/chat/room/10", authFor(me)), channel))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("채팅방을 찾을 수 없습니다");
        }

        @Test
        @DisplayName("나가지 않은 참여자는 정상 구독된다 — 필터가 과하게 막지 않는지 확인")
        void stillAllowsActiveParticipant() {
            when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
            when(chatPTRepository.findByChatRoomAndUser(room, me))
                    .thenReturn(Optional.of(participant(room, me, true)));

            assertThatCode(() -> interceptor.preSend(
                    subscribeMessage("/topic/chat/room/10", authFor(me)), channel))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("다른 명령")
    class OtherCommands {

        @Test
        @DisplayName("SEND 등 다른 명령은 인가 검사 없이 통과한다")
        void passesThroughOtherCommands() {
            StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
            accessor.setDestination("/app/chat/send");
            accessor.setLeaveMutable(true);
            Message<?> message = org.springframework.messaging.support.MessageBuilder
                    .createMessage(new byte[0], accessor.getMessageHeaders());

            interceptor.preSend(message, channel);

            verify(chatRoomRepository, never()).findById(anyLong());
        }

        @Test
        @DisplayName("STOMP 헤더가 아닌 메시지는 그대로 돌려준다")
        void returnsNonStompMessageUnchanged() {
            Message<?> plain = org.springframework.messaging.support.MessageBuilder
                    .withPayload("payload").build();

            assertThat(interceptor.preSend(plain, channel)).isSameAs(plain);
        }
    }
}
