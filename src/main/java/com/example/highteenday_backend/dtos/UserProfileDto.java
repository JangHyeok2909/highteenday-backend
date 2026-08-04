package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.Grade;
import com.example.highteenday_backend.enums.RelationStatus;
import lombok.Builder;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 남이 보는 프로필. 친구에게만 열린다.
 *
 * 실명, 이메일, 전화번호, 출생연도, 성별, 반, provider, role은 어디에도 담지 않는다.
 * 반(userClass)을 뺀 이유는 학교 + 학년 + 반이면 현실의 특정 개인이 거의 확정되기 때문이고,
 * 생일에서 연도를 뺀 이유는 친구 생일 알림에는 월·일이면 충분하기 때문이다.
 */
@Builder
public record UserProfileDto(
        Long userId,
        String nickname,
        String profileUrl,
        RelationStatus relation,
        String schoolName,
        Grade grade,
        String birthday
) {
    private static final DateTimeFormatter MONTH_DAY = DateTimeFormatter.ofPattern("MM-dd");

    public static UserProfileDto fromEntity(User user, RelationStatus relation) {
        LocalDate birthDate = user.getBirthDateValue();
        return UserProfileDto.builder()
                .userId(user.getId())
                .nickname(user.getNicknameValue())
                .profileUrl(user.getProfileUrl())
                .relation(relation)
                .schoolName(user.getSchool() == null ? null : user.getSchool().getName())
                .grade(user.getGrade())
                .birthday(birthDate == null ? null : birthDate.format(MONTH_DAY))
                .build();
    }
}
