package com.example.highteenday_backend.dtos.Friends;

import lombok.Builder;

/**
 * 친구 목록과 주고받은 요청 목록에 쓰인다.
 *
 * 실명과 로그인 이메일은 담지 않는다. 커뮤니티에서 서로를 가리키는 이름은 닉네임이고,
 * 실명·이메일은 가입과 본인확인에만 쓰이는 값이다.
 */
@Builder
public record FriendInfoDto(
        Long id,
        String nickname,
        String profileUrl
){
}
