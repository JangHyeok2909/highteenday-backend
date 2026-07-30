package com.example.highteenday_backend.dtos.Friends;

import lombok.Builder;

@Builder
public record FriendInfoDto(
        Long id,
        String name,
        String nickname,
        String email,
        String profileUrl
){
}
