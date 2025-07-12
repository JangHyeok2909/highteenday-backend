package com.example.highteenday_backend.dtos;

import lombok.Builder;

@Builder
public record UserInfoDto(
        String name,
        String nickname,
        String email,
        String provider
) {}
