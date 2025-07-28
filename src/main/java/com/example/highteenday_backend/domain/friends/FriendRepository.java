package com.example.highteenday_backend.domain.friends;


import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FriendRepository extends JpaRepository<Friend, Long> {

    // 모든 친구 관계 검색
    @Query(value = """
            SELECT u.*
            FROM friends f JOIN users u ON f.USR_frd_id = u.id
            WHERE f.USR_id = :id AND f.FRD_status = 'FRIEND'
            
            UNION
            
            SELECT u.*
            FROM friends f JOIN users u ON f.USR_id = u.id
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

    // A B의 차단 관계 검색( A 기준 )
    Optional<Friend> findByUserAndFriend(User user, User friend);

}