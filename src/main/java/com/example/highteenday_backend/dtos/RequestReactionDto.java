package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.reactions.ReactionKind;
import jakarta.validation.constraints.NotNull;

public record RequestReactionDto(@NotNull ReactionKind kind) {
}
