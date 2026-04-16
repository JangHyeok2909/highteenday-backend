package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class LikeStateDto {
    private Long commentId;
    private Long postId;
    private boolean isLiked=false;
    private boolean isDisliked=false;
    private int likeCount=0;
    private int dislikeCount=0;
}
