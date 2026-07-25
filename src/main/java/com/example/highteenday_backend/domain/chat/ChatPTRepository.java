package com.example.highteenday_backend.domain.chat;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatPTRepository extends JpaRepository<ChatParticipants, Long> {

    List<ChatParticipants> findByUserAndIsValidTrue(User user);

    Optional<ChatParticipants> findByChatRoomAndUser(ChatRoom chatRoom, User user);

    List<ChatParticipants> findByChatRoomAndIsValidTrue(ChatRoom chatRoom);

    @Query("""
        SELECT cp1.chatRoom FROM ChatParticipants cp1
        JOIN ChatParticipants cp2 ON cp1.chatRoom = cp2.chatRoom
        WHERE cp1.user = :user1 AND cp2.user = :user2
        AND cp1.chatRoom.category = 'PRIVATE'
        AND cp1.isValid = true AND cp2.isValid = true
    """)
    Optional<ChatRoom> findPrivateRoomBetween(@Param("user1") User user1,
                                               @Param("user2") User user2);
}
