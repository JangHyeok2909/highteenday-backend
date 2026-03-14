package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Builder
@AllArgsConstructor
@Data
public class PostPreviewDto {
    private Long id;
    private String author;
    private Long userId;
    private String title;
    @Builder.Default
    private boolean isAnonymous=true;
    @Builder.Default
    private int viewCount = 0;
    @Builder.Default
    private int likeCount = 0;
    @Builder.Default
    private int dislikeCount = 0;
    @Builder.Default
    private int commentCount = 0;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    @Builder.Default
    private boolean isUpdated=false;
    private BoardDto board;
}
