package com.example.highteenday_backend.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum NotificationCategory {
    //친구 관련
    FRIEND_REQUEST,       // 친구 요청
    FRIEND_ACCEPT,        // 친구 요청 수락
    //게시글,댓글 관련
    COMMENT_REPLY,        // 내 댓글에 답글
    POST_COMMENT,         // 내 게시글에 댓글
    POST_LIKE_THRESHOLD,  // 내 글/댓글 좋아요 일정 수 이상
    POST_TRENDING,         // 내 게시글이 인기글에 등록됨

    // 유저 관련
    FRIEND_BIRTHDAY      // 친구 생일 알림
}
