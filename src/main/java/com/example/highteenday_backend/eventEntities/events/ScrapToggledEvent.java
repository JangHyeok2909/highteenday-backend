package com.example.highteenday_backend.eventEntities.events;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@AllArgsConstructor
public class ScrapToggledEvent {
    private final Long postId;
    private final boolean newScrap;
}
