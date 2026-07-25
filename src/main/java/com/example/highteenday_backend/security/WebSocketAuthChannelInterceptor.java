package com.example.highteenday_backend.security;

import com.example.highteenday_backend.domain.chat.ChatPTRepository;
import com.example.highteenday_backend.domain.chat.ChatRoom;
import com.example.highteenday_backend.domain.chat.ChatRoomRepository;
import com.example.highteenday_backend.domain.users.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketAuthChannelInterceptor implements ChannelInterceptor {

    private final ChatPTRepository chatPTRepository;
    private final ChatRoomRepository chatRoomRepository;

    private static final Pattern CHAT_ROOM_PATTERN = Pattern.compile("^/topic/chat/room/(\\d+)");

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            Map<String, Object> sessionAttrs = accessor.getSessionAttributes();
            if (sessionAttrs != null) {
                Authentication auth = (Authentication) sessionAttrs.get("authentication");
                if (auth != null) {
                    accessor.setUser(auth);
                }
            }
        }

        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            String destination = accessor.getDestination();
            if (destination != null) {
                Matcher matcher = CHAT_ROOM_PATTERN.matcher(destination);
                if (matcher.find()) {
                    Long roomId = Long.parseLong(matcher.group(1));
                    validateRoomParticipant(accessor, roomId);
                }
            }
        }

        return message;
    }

    private void validateRoomParticipant(StompHeaderAccessor accessor, Long roomId) {
        Authentication auth = (Authentication) accessor.getUser();
        if (auth == null) {
            throw new IllegalStateException("인증되지 않은 사용자입니다.");
        }

        CustomUserPrincipal principal = (CustomUserPrincipal) auth.getPrincipal();
        User user = principal.getUser();

        ChatRoom chatRoom = chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new IllegalStateException("채팅방을 찾을 수 없습니다."));

        chatPTRepository.findByChatRoomAndUser(chatRoom, user)
                .orElseThrow(() -> new IllegalStateException("채팅방 참가자가 아닙니다."));
    }
}
