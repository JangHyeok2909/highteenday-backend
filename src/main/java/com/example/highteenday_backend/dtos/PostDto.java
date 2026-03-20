package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.posts.Post;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Builder
@NoArgsConstructor
@AllArgsConstructor
@Data
public class PostDto {
    private Long id;
    private String author;
    private String profileUrl;
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
    private BoardDto board;

    public static PostDto fromEntity(Post post) {
        String nickname = "익명";
        Long userId = null;
        if (!post.isAnonymous()) {
            nickname = post.getUser().getNickname();
            userId = post.getUser().getId();
        }
        return PostDto.builder()
                .id(post.getId())
                .author(nickname)
                .profileUrl(post.getUser().getProfileUrl())
                .userId(userId)
                .title(post.getTitle())
                .content(post.getContent())
                .viewCount(post.getViewCount())
                .likeCount(post.getLikeCount())
                .dislikeCount(post.getDislikeCount())
                .commentCount(post.getCommentCount())
                .isAnonymous(post.isAnonymous())
                .createdAt(post.getCreated())
                .updatedAt(post.getUpdatedDate())
                .isUpdated(post.getUpdatedBy() != null)
                .board(BoardDto.fromEntity(post.getBoard()))
                .build();
    }
}
