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

    public static PostPreviewDto fromEntity(Post post) {
        String nickname = "익명";
        if (!post.isAnonymous()) {
            nickname = post.getUser().getNickname();
        }
        return PostPreviewDto.builder()
                .id(post.getId())
                .boardId(post.getBoard().getId())
                .author(nickname)
                .title(post.getTitle())
                .viewCount(post.getViewCount())
                .likeCount(post.getLikeCount())
                .commentCount(post.getCommentCount())
                .createdAt(post.getCreated())
                .build();
    }
}
