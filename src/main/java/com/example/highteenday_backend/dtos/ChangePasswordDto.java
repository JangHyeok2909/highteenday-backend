package com.example.highteenday_backend.dtos;

public record ChangePasswordDto (
        String pastPassword,
        String newPassword
) {
}
