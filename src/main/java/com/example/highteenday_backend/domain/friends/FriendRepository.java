package com.example.highteenday_backend.domain.friends;


import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FriendRepository extends JpaRepository<Friend, Long> {

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
}
