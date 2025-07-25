package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Builder
@AllArgsConstructor
@Data
public class PostDto {
    private Long id;
    private String author;
    private Long userId;
    private String title;
    private String content;
    @Builder.Default
    private int viewCount = 0;
    @Builder.Default
    private int likeCount = 0;
    @Builder.Default
    private int dislikeCount = 0;
    @Builder.Default
    private int commentCount = 0;
    @Builder.Default
    private boolean isLiked=false;
    @Builder.Default
    private boolean isDisliked=false;
    @Builder.Default
    private boolean isScrapped =false;
    @Builder.Default
    private boolean isAnonymous=true;
    @Builder.Default
    private boolean isOwner=false;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    @Builder.Default
    private boolean isUpdated=false;
    /*
    private User user; // 작성자
    private String title;
    private String content;
    private int viewCount = 0;
    private int likeCount = 0;
    private int commentCount = 0;
    private boolean isAnonymous;
    private Board board; */
}
