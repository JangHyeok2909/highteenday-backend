package com.example.highteenday_backend.domain.chat;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ChatMsgRepository extends JpaRepository<ChatMsg, Long> {

    List<ChatMsg> findTop50ByChatRoomAndIsValidTrueOrderByCreatedDesc(ChatRoom chatRoom);

    @Query("""
        SELECT COUNT(m) FROM ChatMsg m
        WHERE m.chatRoom = :chatRoom
        AND m.isValid = true
        AND m.created > :lastReadDate
    """)
    int countUnreadMessages(@Param("chatRoom") ChatRoom chatRoom,
                            @Param("lastReadDate") LocalDateTime lastReadDate);

    @Query("""
        SELECT COUNT(m) FROM ChatMsg m
        WHERE m.chatRoom = :chatRoom
        AND m.isValid = true
    """)
    int countByChatRoomAndIsValidTrue(@Param("chatRoom") ChatRoom chatRoom);
}
