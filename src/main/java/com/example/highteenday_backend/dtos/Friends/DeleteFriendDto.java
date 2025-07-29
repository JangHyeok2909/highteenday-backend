package com.example.highteenday_backend.dtos.Friends;

public record DeleteFriendDto(
        Long id, //  유저 아이디
        String email // 유저 이메일
) {
}
