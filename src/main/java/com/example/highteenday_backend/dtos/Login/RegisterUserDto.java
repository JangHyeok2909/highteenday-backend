package com.example.highteenday_backend.dtos.Login;

import com.example.highteenday_backend.enums.Gender;
import com.example.highteenday_backend.enums.Grade;
import lombok.Builder;

import java.time.LocalDate;

@Builder
public record RegisterUserDto(
    String name,
    String nickname,
    String phone,
    String email,
    Grade grade,
    Gender gender,
    String provider,
    String password,
    LocalDate birthDate
){}