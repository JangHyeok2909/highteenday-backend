package com.example.highteenday_backend.dtos.Friends;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.RelationStatus;
import lombok.Builder;

/**
 * 닉네임 검색 결과. 아직 아무 사이도 아닌 사람이 대상이므로 노출을 최소로 둔다.
 *
 * 기존에는 FriendInfoDto를 그대로 돌려줘서 실명과 로그인 이메일이 함께 나갔다.
 * 닉네임만 알면 누구든 조회할 수 있는 창구라 그대로 두면 안 된다.
 */
@Builder
public record UserSearchResultDto(
        Long userId,
        String nickname,
        String profileUrl,
        RelationStatus relation
) {
    public static UserSearchResultDto fromEntity(User user, RelationStatus relation) {
        return UserSearchResultDto.builder()
                .userId(user.getId())
                .nickname(user.getNicknameValue())
                .profileUrl(user.getProfileUrl())
                .relation(relation)
                .build();
    }
}
