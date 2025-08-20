package com.example.highteenday_backend.dtos.Login;

import com.example.highteenday_backend.enums.Gender;
import com.example.highteenday_backend.enums.Grade;
import lombok.Builder;

@Builder
public record RegisterUserDto(
    String name,
    String nickname,
    String email,
    Grade grade,
    Gender gender,
    String provider,
    String password
){}