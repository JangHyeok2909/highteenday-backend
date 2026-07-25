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
    private String profileUrl;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    @Builder.Default
    private boolean isUpdated = false;

    /**
     * 익명 댓글은 작성자를 식별할 수 있는 값을 담지 않는다.
     * 목록 응답에서 "익명1", "익명(글쓴이)" 같은 표시 번호는
     * CommentAnonymizationService가 이 안전한 기본값 위에 덮어쓴다.
     */
    public static CommentDto fromEntity(Comment comment) {
        boolean anonymous = comment.isAnonymous();
        return CommentDto.builder()
                .id(comment.getId())
                .userId(anonymous ? null : comment.getUser().getId())
                .parentId(comment.getParent() != null ? comment.getParent().getId() : null)
                .author(anonymous ? "익명" : comment.getUser().getNicknameValue())
                .content(comment.getContent())
                .likeCount(comment.getLikeCount())
                .dislikeCount(comment.getDislikeCount())
                .isAnonymous(anonymous)
                .profileUrl(anonymous ? null : comment.getUser().getProfileUrl())
                .url(comment.getS3Url())
                .createdAt(comment.getCreated())
                .updatedAt(comment.getUpdatedDate())
                .isUpdated(comment.getUpdatedBy() != null)
                .postId(comment.getPost().getId())
                .postTitle(comment.getPost().getTitle())
                .build();
    }
}
