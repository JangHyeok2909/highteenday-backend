package com.example.highteenday_backend.eventEntities.events;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@AllArgsConstructor
public class PostReactedEvent {
    private final Long postId;
}
