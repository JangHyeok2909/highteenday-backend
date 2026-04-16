package com.example.highteenday_backend.dtos.Login;

import jakarta.validation.constraints.NotBlank;

public record LoginRequestDto(
        @NotBlank(message = "이메일을 입력하세요.")
        String email,
        @NotBlank(message = "비밀번호를 입력하세요.")
        String password
) {}
