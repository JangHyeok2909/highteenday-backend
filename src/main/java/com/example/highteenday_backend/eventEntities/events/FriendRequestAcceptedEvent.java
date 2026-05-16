package com.example.highteenday_backend.eventEntities.events;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@AllArgsConstructor
public class FriendRequestAcceptedEvent {
    private final Long requesterId;
    private final Long receiverId;
}
