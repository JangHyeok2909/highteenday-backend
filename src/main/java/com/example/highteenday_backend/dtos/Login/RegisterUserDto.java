package com.example.highteenday_backend.dtos.Login;

import lombok.Builder;

@Builder
public record RegisterUserDto(
    String name,
    String email,
    String nickname,
    String provider,
    String password
){}