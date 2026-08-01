package com.example.highteenday_backend.domain.friends;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FriendReqRepository extends JpaRepository<FriendReq, Long> {

    // 내가 요청 받은 목록 | receiver 가 id
    @Query(value = """
            SELECT fq.*
            FROM friends_requests fq
            WHERE fq.USR_rec_id = :usr_rec_id
              AND fq.is_valid = true
            """, nativeQuery = true)
    List<FriendReq> findReceivedFriendRequestsByReceiverId(@Param("usr_rec_id") Long userId);

    // 내가 신청 보낸 목록 | requester 가 id

    @Query(value = """
            SELECT fq.*
            FROM friends_requests fq
            WHERE fq.USR_req_id = :usr_req_id
              AND fq.is_valid = true
            """, nativeQuery = true)
    List<FriendReq> findSentFriendsRequest(@Param("usr_req_id") Long userId);

    // 후보 중 내가 요청을 보낸 사람들. 참여자 목록처럼 N명의 관계를 한 번에 구할 때 쓴다.
    @Query("""
            SELECT fq.receiver.id FROM FriendReq fq
            WHERE fq.requester.id = :me
              AND fq.receiver.id IN (:candidates)
              AND fq.isValid = true
            """)
    List<Long> findRequestedIdsAmong(@Param("me") Long meId,
                                     @Param("candidates") Collection<Long> candidateIds);

    // 후보 중 나에게 요청을 보낸 사람들.
    @Query("""
            SELECT fq.requester.id FROM FriendReq fq
            WHERE fq.receiver.id = :me
              AND fq.requester.id IN (:candidates)
              AND fq.isValid = true
            """)
    List<Long> findRequesterIdsAmong(@Param("me") Long meId,
                                     @Param("candidates") Collection<Long> candidateIds);

    // 방향 무관하게 두 사람 사이에 살아있는 요청을 찾는다. 요청 전 중복/역방향 검사용.
    @Query("""
            SELECT fq FROM FriendReq fq
            WHERE fq.isValid = true
              AND ((fq.requester.id = :a AND fq.receiver.id = :b)
                OR (fq.requester.id = :b AND fq.receiver.id = :a))
            """)
    List<FriendReq> findBetween(@Param("a") Long userIdA, @Param("b") Long userIdB);

    @Query("SELECT fq FROM FriendReq fq WHERE fq.id = :id AND fq.isValid = true")
    Optional<FriendReq> findActiveById(@Param("id") Long id);
}
