package com.example.highteenday_backend.eventEntities.events;

import com.example.highteenday_backend.domain.reactions.ReactionTarget;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
@AllArgsConstructor
public class ReactionChangedEvent {
    private final ReactionTarget target;
    private final Long targetId;
}
