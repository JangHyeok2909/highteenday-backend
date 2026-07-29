package com.example.highteenday_backend.domain.chat;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {

    // 1:1 방 중복 생성 방지. 기존 방이 있으면 그대로 반환한다.
    Optional<ChatRoom> findByPairKey(String pairKey);
}
