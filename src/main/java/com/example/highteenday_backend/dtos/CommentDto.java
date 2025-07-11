package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Builder
@AllArgsConstructor
@Data
public class CommentDto {
    private Long id;
    private String author;
    private Long userId;
    private boolean isAnonymous = true;
    private Long parentId;
    private String content;
    private Integer likeCount;
    private LocalDateTime createdAt;
    private String url;
    private boolean isLiked=false;
    private boolean isDisliked=false;
}
