package com.example.highteenday_backend.domain.friends;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FriendReqRepository extends JpaRepository<FriendReq, Long> {

    boolean existsByRequesterAndReceiver(User request, User receiver);


    // 내가 요청 받은 목록 | receiver 가 id
    @Query(value = """
            SELECT fq.*
            FROM friends_requests fq
            WHERE fq.USR_rec_id = :usr_rec_id
            """, nativeQuery = true)
    List<FriendReq> findReceivedFriendRequestsByRecieverId(@Param("usr_rec_id") Long userId);

    // 내가 신청 보낸 목록 | requester 가 id

    @Query(value = """
            SELECT fq.*
            FROM friends_requests fq
            WHERE fq.USR_req_id = :usr_req_id
            """, nativeQuery = true)
    List<FriendReq> findSentFriendsRequest(@Param("usr_req_id") Long userId);
}
