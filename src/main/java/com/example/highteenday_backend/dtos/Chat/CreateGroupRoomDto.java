package com.example.highteenday_backend.dtos.Chat;

import java.util.List;

public record CreateGroupRoomDto(
        String name,
        List<Long> memberIds
) {
}
