package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.comments.Comment;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Builder
@NoArgsConstructor
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
    private boolean isLiked = false;
    @Builder.Default
    private boolean isDisliked = false;
    @Builder.Default
    private boolean isOwner = false;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    @Builder.Default
    private boolean isUpdated = false;

    public static CommentDto fromEntity(Comment comment) {
        return CommentDto.builder()
                .id(comment.getId())
                .userId(comment.getUser().getId())
                .parentId(comment.getParent() != null ? comment.getParent().getId() : null)
                .author(comment.getUser().getNickname())
                .content(comment.getContent())
                .likeCount(comment.getLikeCount())
                .dislikeCount(comment.getDislikeCount())
                .isAnonymous(comment.isAnonymous())
                .url(comment.getS3Url())
                .createdAt(comment.getCreated())
                .updatedAt(comment.getUpdatedDate())
                .isUpdated(comment.getUpdatedBy() != null)
                .postId(comment.getPost().getId())
                .postTitle(comment.getPost().getTitle())
                .build();
    }
}
