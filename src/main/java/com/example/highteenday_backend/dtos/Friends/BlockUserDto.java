package com.example.highteenday_backend.dtos.Friends;

public record BlockUserDto(
        Long id, // 차단할 유저 id
        String email // 차단할 유저 이메일
) {
}
