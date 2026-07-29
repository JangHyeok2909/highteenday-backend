package com.example.highteenday_backend.dtos.Chat;

import java.util.List;

public record InviteMembersDto(
        List<Long> memberIds
) {
}
