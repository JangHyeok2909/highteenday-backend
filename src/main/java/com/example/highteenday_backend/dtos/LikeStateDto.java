package com.example.highteenday_backend.dtos;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class LikeStateDto {
    private Long commentId;
    private Long postId;
    private boolean isLiked;
    private boolean isDisliked;
    private int likeCount;
    private int dislikeCount;
}
