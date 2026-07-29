package com.example.highteenday_backend.domain.chat;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ChatPTRepository extends JpaRepository<ChatParticipants, Long> {

    // 내가 참여 중인 방 목록. 방을 함께 로딩해 목록 조회의 N+1을 막는다.
    @Query("""
            SELECT p FROM ChatParticipants p
            JOIN FETCH p.chatRoom
            WHERE p.user = :user AND p.isValid = true
            """)
    List<ChatParticipants> findMyRooms(@Param("user") User user);

    // 나간 참여자도 찾아야 재입장(soft delete 복구) 처리가 가능하므로 isValid를 걸지 않는다.
    Optional<ChatParticipants> findByChatRoomAndUser(ChatRoom chatRoom, User user);

    @Query("""
            SELECT p FROM ChatParticipants p
            JOIN FETCH p.user
            WHERE p.chatRoom = :chatRoom AND p.isValid = true
            ORDER BY p.joinedAt ASC
            """)
    List<ChatParticipants> findActiveMembers(@Param("chatRoom") ChatRoom chatRoom);

    // 여러 방의 참여자를 한 번에. 방 목록 화면의 이름/아바타 조립용.
    @Query("""
            SELECT p FROM ChatParticipants p
            JOIN FETCH p.user
            JOIN FETCH p.chatRoom
            WHERE p.chatRoom.id IN :roomIds AND p.isValid = true
            ORDER BY p.joinedAt ASC
            """)
    List<ChatParticipants> findActiveMembersByRoomIds(@Param("roomIds") Collection<Long> roomIds);

    int countByChatRoomAndIsValidTrue(ChatRoom chatRoom);

    @Query("""
            SELECT p FROM ChatParticipants p
            WHERE p.chatRoom = :chatRoom AND p.user.id IN :userIds
            """)
    List<ChatParticipants> findByChatRoomAndUserIds(@Param("chatRoom") ChatRoom chatRoom,
                                                    @Param("userIds") Collection<Long> userIds);
}
