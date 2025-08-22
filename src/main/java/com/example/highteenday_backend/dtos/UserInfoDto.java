package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.enums.Grade;
import lombok.Builder;

@Builder
public record UserInfoDto(
        String name,
        String nickname,
        String email,
        String profileUrl,
        String userClass,
        String userGrade,
        String phoneNum,
        String schoolName,
        String provider,
        String semester
) {}
