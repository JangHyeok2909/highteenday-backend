package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Builder
@AllArgsConstructor
@Data
public class PostPreviewDto {
    Long id;
    Long boardId;
    String boardName;
    String author;
    Long userId;
    String title;
    @Builder.Default
    boolean isAnonymous=true;
    @Builder.Default
    int viewCount = 0;
    @Builder.Default
    int likeCount = 0;
    @Builder.Default
    int commentCount = 0;
    LocalDateTime createdAt;
    LocalDateTime updatedAt;
    @Builder.Default
    boolean isUpdated=false;

}
