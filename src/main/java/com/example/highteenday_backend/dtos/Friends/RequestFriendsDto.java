package com.example.highteenday_backend.dtos.Friends;

import com.example.highteenday_backend.security.CustomUserPrincipal;
import lombok.Builder;
import lombok.Data;


// 친구 신청 dto
// 보인 정보는 @AuthenticationPrincipal 어노테이션으로 들고옴
@Builder
public record RequestFriendsDto(
    String email
) {

}
