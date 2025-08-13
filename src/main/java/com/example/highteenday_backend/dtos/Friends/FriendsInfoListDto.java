package com.example.highteenday_backend.dtos.Friends;

import lombok.Builder;

@Builder
public record FriendsInfoListDto(
        Long id,
        String name,
        String nickname,
        String email,
        Long friendsReqId
//        String school

        // grade, profileImageUri 등등..

){
}
