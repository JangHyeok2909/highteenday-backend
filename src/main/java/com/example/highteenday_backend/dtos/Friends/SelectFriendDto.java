package com.example.highteenday_backend.dtos.Friends;

public record SelectFriendDto (
        String email,       // 모르면 null 주기
        String name,        // 모르면 null 주기
        String nickname     // 모르면 null 주기
){
}
