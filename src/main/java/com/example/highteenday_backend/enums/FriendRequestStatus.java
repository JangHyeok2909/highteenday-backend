package com.example.highteenday_backend.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum FriendRequestStatus {
    REQUESTED("REQUEST"),
    ACCEPTED("ACCEPTED"),
    DECLINED("DECLINED"),
    BLOCKED("BLOCKED");

    private final String key;
}
