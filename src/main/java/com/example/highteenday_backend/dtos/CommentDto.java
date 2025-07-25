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
    private Long postId;
    private String postTitle;
    private Long userId;
    private Long parentId;
    private String content;
    private Integer likeCount;
    private Integer dislikeCount;
    private String url;
    @Builder.Default
    private boolean isAnonymous = true;
    @Builder.Default
    private boolean isLiked=false;
    @Builder.Default
    private boolean isDisliked=false;
    @Builder.Default
    private boolean isOwner=false;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    @Builder.Default
    private boolean isUpdated=false;

}
