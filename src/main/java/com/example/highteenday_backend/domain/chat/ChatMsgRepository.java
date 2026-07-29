package com.example.highteenday_backend.domain.chat;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatMsgRepository extends JpaRepository<ChatMsg, Long> {

    // 커서 기반 페이징 (최신 -> 과거). 첫 페이지는 cursor에 Long.MAX_VALUE를 넘긴다.
    // floorMsgId는 참여자의 입장 시점 메시지 ID로, 그 이전 대화는 노출하지 않는다.
    @Query("""
            SELECT m FROM ChatMsg m
            JOIN FETCH m.sender
            WHERE m.chatRoom.id = :roomId
                AND m.isValid = true
                AND m.id < :cursor
                AND m.id > :floorMsgId
            ORDER BY m.id DESC
            """)
    List<ChatMsg> findByRoomIdWithCursor(@Param("roomId") Long roomId,
                                         @Param("cursor") Long cursor,
                                         @Param("floorMsgId") Long floorMsgId,
                                         Pageable pageable);

    // 재전송 멱등성 — UNIQUE 제약 위반 시 원본을 되돌려주기 위한 조회
    Optional<ChatMsg> findByChatRoomIdAndClientMsgId(Long roomId, String clientMsgId);

    // 방의 마지막 메시지 ID. 신규 입장자의 히스토리 하한선으로 쓴다.
    @Query("SELECT COALESCE(MAX(m.id), 0) FROM ChatMsg m WHERE m.chatRoom.id = :roomId")
    Long findLastMsgIdByRoomId(@Param("roomId") Long roomId);

    // 내가 속한 모든 방의 안읽음 수를 쿼리 한 방으로. 방 목록의 N+1을 막는다.
    // 내가 보낸 메시지와 SYSTEM 메시지는 안읽음으로 세지 않는다.
    @Query(value = """
            SELECT p.CHT_RM_id AS roomId, COUNT(m.CHT_MSG_id) AS unreadCount
            FROM chat_participants p
            LEFT JOIN chat_messages m
                ON m.CHT_RM_id = p.CHT_RM_id
                AND m.CHT_MSG_id > COALESCE(p.CHT_PT_last_read_msg_id, 0)
                AND m.USR_id != :userId
                AND m.CHT_MSG_type != 'SYSTEM'
                AND m.is_valid = true
            WHERE p.USR_id = :userId AND p.is_valid = true
            GROUP BY p.CHT_RM_id
            """, nativeQuery = true)
    List<UnreadCountProjection> countUnreadByUserId(@Param("userId") Long userId);

    interface UnreadCountProjection {
        Long getRoomId();
        Long getUnreadCount();
    }
}
