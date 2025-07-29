package com.example.highteenday_backend.dtos.Friends;

import lombok.Builder;

@Builder
public record FriendsInfoDto(
        Long id,
        String name,
        String nickname,
        String email
//        String school

        // grade, profileImageUri 등등..

){
}
