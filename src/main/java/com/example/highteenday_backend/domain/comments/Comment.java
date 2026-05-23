package com.example.highteenday_backend.domain.comments;


import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(name= "comments")
@Entity
public class Comment extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CMT_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false, foreignKey = @ForeignKey(name = "fk_comments_usr"))
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PST_id", nullable = false, foreignKey = @ForeignKey(name = "fk_comments_pst"))
    private Post post;

    // 대댓글: 자기 참조 관계
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CMT_parent_id", foreignKey = @ForeignKey(name = "fk_comments_parent"))
    private Comment parent;

    @Column(name = "CMT_is_anonymous", nullable = false)
    private boolean isAnonymous = true;

    @Column(name = "CMT_content", length = 10000, nullable = false)
    private String content;

    @Column(name = "CMT_like_count")
    private Integer likeCount = 0;
    @Column(name = "CMT_dislike_count")
    private Integer dislikeCount = 0;

    @Column(name = "CMT_image_url",columnDefinition = "LONGTEXT")
    private String s3Url;

    // === 정적 팩토리 ===

    public static Comment create(User user, Post post, String content,
                                 boolean isAnonymous, String imageUrl) {
        Comment comment = new Comment();
        comment.user = user;
        comment.post = post;
        comment.content = content;
        comment.isAnonymous = isAnonymous;
        comment.s3Url = imageUrl;
        return comment;
    }

    // === 도메인 메서드 ===

    /** 대댓글 관계 설정 */
    public void assignParent(Comment parent) {
        this.parent = parent;
    }

    public void editContent(String content) {
        this.content = content;
    }

    public void changeImage(String imageUrl) {
        this.s3Url = imageUrl;
    }

    public void removeImage() {
        this.s3Url = null;
    }

    /** 반응 카운트 동기화 */
    public void syncReactionCounts(int likeCount, int dislikeCount) {
        this.likeCount = likeCount;
        this.dislikeCount = dislikeCount;
    }

    // === Builder (테스트 호환) ===

    @Builder
    private Comment(Long id, User user, Post post, Comment parent,
                    boolean isAnonymous, String content,
                    Integer likeCount, Integer dislikeCount, String s3Url) {
        this.id = id;
        this.user = user;
        this.post = post;
        this.parent = parent;
        this.isAnonymous = isAnonymous;
        this.content = content;
        this.likeCount = likeCount != null ? likeCount : 0;
        this.dislikeCount = dislikeCount != null ? dislikeCount : 0;
        this.s3Url = s3Url;
    }
}
