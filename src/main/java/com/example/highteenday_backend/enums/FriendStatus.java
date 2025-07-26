package com.example.highteenday_backend.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum FriendStatus{

    FRIEND("FRIEND")
    , BLOCKED("BLOCKED")
//    , DELETE("DELETE")
    ;

    private final String key;
}
