package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Builder
@AllArgsConstructor
@Data
public class PostDto {

    private String author;
    private Long userId;
    private String title;
    private String content;
    private int viewCount = 0;
    private int likeCount = 0;
    private int commentCount = 0;
    private LocalDateTime createdAt;
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
