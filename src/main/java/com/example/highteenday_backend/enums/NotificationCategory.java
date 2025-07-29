package com.example.highteenday_backend.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum NotificationCategory {
    FRIEND_REQ("FRIEND_REQ"),
    POST_LIKE("POST_LIKE"),
    COMMENT_LIKE("COMMENT_LIKE");

    private final String key;
}
