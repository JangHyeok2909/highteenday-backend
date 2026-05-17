package com.example.highteenday_backend.dtos.Friends;

import lombok.Builder;


// 친구 신청 dto
// 보인 정보는 @AuthenticationPrincipal 어노테이션으로 들고옴
@Builder
public record RequestFriendDto(
    String nickname
) {

}
