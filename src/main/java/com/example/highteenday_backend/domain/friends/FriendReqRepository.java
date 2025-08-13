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
            SELECT  fq.FRD_REQ_id AS FRD_REQ_id,
                    fq.USR_req_id      AS USR_req_id,
                    fq.USR_rec_id      AS USR_rec_id,
                    fq.FRD_REQ_status  AS FRD_REQ_status
            FROM friends_requests fq
            WHERE fq.USR_rec_id = :id
            """, nativeQuery = true)
    List<FriendReq> findReceivedFriendRequests(@Param("id") Long userId);

    // 내가 신청 보낸 목록 | requester 가 id

    @Query(value = """
            SELECT  fq.FRD_REQ_id AS FRD_REQ_id,
                    fq.USR_req_id      AS USR_req_id,
                    fq.USR_rec_id      AS USR_rec_id,
                    fq.FRD_REQ_status  AS FRD_REQ_status
            FROM friends_requests fq
            WHERE fq.USR_req_id = :id
            """, nativeQuery = true)
    List<FriendReq> findSentFriendsRequest(@Param("id") Long userId);
}
