package com.example.highteenday_backend.dtos;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class LikeStateDto {
    private Long commentId;
    private Long postId;
    private boolean isLiked=false;
    private boolean isDisliked=false;
    private int likeCount=0;
    private int dislikeCount=0;
}
