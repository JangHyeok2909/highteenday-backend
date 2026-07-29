package com.example.highteenday_backend.domain.friends;


import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FriendRepository extends JpaRepository<Friend, Long> {

    // 모든 친구 관계 검색
    @Query(value = """
            SELECT u.*
            FROM friends f JOIN users u ON f.USR_frd_id = u.USR_id
            WHERE f.USR_id = :id AND f.FRD_status = 'FRIEND'
            
            UNION
            
            SELECT u.*
            FROM friends f JOIN users u ON f.USR_id = u.USR_id
            WHERE f.USR_frd_id = :id AND f.FRD_status = 'FRIEND'
            """, nativeQuery = true)
    List<User> findAllFriends(@Param("id") Long userId);


    // A, B 친구 관계 검색
    @Query(value = """
            SELECT f.*
            FROM friends f
            WHERE (f.USR_id = :me AND f.USR_frd_id = :friend)
                OR (f.USR_id = :friend AND f.USR_frd_id = :me)
            """, nativeQuery = true)
    List<Friend> findFriendsRelations(@Param("me") Long meId, @Param("friend") Long friendId);

    // 후보 목록 중 나와 친구인 사용자 ID만 추린다. 단체방 초대 시 1인 1쿼리를 피하기 위함.
    @Query(value = """
            SELECT f.USR_frd_id
            FROM friends f
            WHERE f.USR_id = :me AND f.FRD_status = 'FRIEND' AND f.USR_frd_id IN (:candidates)

            UNION

            SELECT f.USR_id
            FROM friends f
            WHERE f.USR_frd_id = :me AND f.FRD_status = 'FRIEND' AND f.USR_id IN (:candidates)
            """, nativeQuery = true)
    List<Long> findFriendIdsAmong(@Param("me") Long meId,
                                  @Param("candidates") Collection<Long> candidateIds);

    // A B의 차단 관계 검색( A 기준 )
    Optional<Friend> findByUserAndFriend(User user, User friend);

}