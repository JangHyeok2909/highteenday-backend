package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.friends.FriendReq;
import lombok.Builder;

@Builder
public record RespondFriendRequestDto(

        // 친구 신청 테이블[ FriendReq ] id
        Long id,
        String status
) {
}
