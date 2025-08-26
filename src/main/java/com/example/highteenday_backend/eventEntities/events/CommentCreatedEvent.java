package com.example.highteenday_backend.eventEntities.events;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Data
@Builder
@AllArgsConstructor
public class CommentCreatedEvent {
    private final Long commentId;
    private final Long postId;
    private final Long authorId;
    private final Long postAuthorId;
    private final Long userId;
    private final Long parentCommentAuthorId; //답글인 경우
    private final String content;
}
