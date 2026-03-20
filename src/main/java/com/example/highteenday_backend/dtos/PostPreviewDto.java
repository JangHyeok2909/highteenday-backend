package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Builder
@NoArgsConstructor
@AllArgsConstructor
@Data
public class PostPreviewDto {
    Long id;
    Long boardId;
    String author;
    String title;
    @Builder.Default
    int viewCount = 0;
    @Builder.Default
    int likeCount = 0;
    @Builder.Default
    int commentCount = 0;
    LocalDateTime createdAt;
}
