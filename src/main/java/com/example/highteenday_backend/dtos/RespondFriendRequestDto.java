package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.friends.FriendReq;
import lombok.Builder;

@Builder
public record RespondFriendRequestDto(
        String status
) {
}
