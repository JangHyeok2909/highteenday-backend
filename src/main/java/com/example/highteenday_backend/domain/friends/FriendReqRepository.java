package com.example.highteenday_backend.domain.friends;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FriendReqRepository extends JpaRepository<FriendReq, Long> {

    boolean existsByRequesterAndReceiver(User request, User receiver);
}
