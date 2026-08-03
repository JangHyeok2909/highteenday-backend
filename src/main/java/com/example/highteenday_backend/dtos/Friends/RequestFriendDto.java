package com.example.highteenday_backend.dtos.Friends;

import lombok.Builder;


// 친구 신청 dto
// 보인 정보는 @AuthenticationPrincipal 어노테이션으로 들고옴
//
// 닉네임이 아니라 id로 받는다. 닉네임에는 DB 유니크 제약이 없고 변경도 가능해서,
// 화면에서 확인한 사람과 실제로 요청이 가는 사람이 달라질 수 있다.
@Builder
public record RequestFriendDto(
    Long targetUserId
) {

}
