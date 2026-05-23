package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.users.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Table(
        name= "posts",
        indexes = {
                @Index(
                        name = "idx_posts_brd_valid_id",
                        columnList = "BRD_id, is_valid, PST_id DESC"
                ),
                @Index(
                        name = "idx_posts_brd_valid_like",
                        columnList = "BRD_id, is_valid, PST_like_count DESC"
                ),
                @Index(
                        name = "idx_posts_brd_valid_view",
                        columnList = "BRD_id, is_valid, PST_view_count DESC"
                )
        }
)
@Entity
public class Post extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "PST_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false, foreignKey = @ForeignKey(name = "fk_posts_usr"))
    private User user; // 작성자

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "BRD_id", nullable = false, foreignKey = @ForeignKey(name = "fk_posts_brd"))
    private Board board; // 게시판

    @Column(name = "PST_title", length = 50, nullable = false)
    private String title;

    //html 형식 그대로 저장
    @Column(name = "PST_content", columnDefinition = "TEXT", nullable = false)
    private String content;

    //쿼리 성능을 위한 비정규화 컬럼
    @Column(name = "PST_view_count")
    private int viewCount = 0;
    @Column(name = "PST_like_count")
    private int likeCount = 0;
    @Column(name = "PST_dislike_count")
    private int dislikeCount = 0;
    @Column(name = "PST_comment_count")
    private int commentCount = 0;
    @Column(name = "PST_scrap_count")
    private int scrapCount = 0;
    @Column(name = "PST_is_anonymous")
    private boolean isAnonymous = true;
    @Column(name = "USR_nickname", length = 12, nullable = false)
    private String nickname = "익명";

    // === 정적 팩토리 ===

    public static Post create(User user, Board board, String title,
                              String content, boolean isAnonymous) {
        Post post = new Post();
        post.user = user;
        post.board = board;
        post.title = title;
        post.content = content;
        post.isAnonymous = isAnonymous;
        post.nickname = isAnonymous ? "익명" : user.getNicknameValue();
        return post;
    }

    // === 도메인 메서드 ===

    public void editTitle(String title) {
        this.title = title;
    }

    public void editContent(String content) {
        this.content = content;
    }

    public void changeAnonymous(boolean isAnonymous) {
        this.isAnonymous = isAnonymous;
    }

    /** 반응 카운트 동기화 — Service가 DB count 결과를 전달 */
    public void syncReactionCounts(int likeCount, int dislikeCount) {
        this.likeCount = likeCount;
        this.dislikeCount = dislikeCount;
    }

    public void incrementCommentCount() {
        this.commentCount++;
    }

    public void decrementCommentCount() {
        if (this.commentCount > 0) this.commentCount--;
    }

    /** 스크랩 카운트 동기화 — Service가 DB count 결과를 전달 */
    public void syncScrapCount(int scrapCount) {
        this.scrapCount = scrapCount;
    }

    /** 조회수 배치 증가 — ViewCountScheduler가 호출 */
    public void addViewCount(int increment) {
        if (increment > 0) this.viewCount += increment;
    }

    // === Builder (테스트/DataInitializer 호환) ===

    @Builder
    private Post(Long id, User user, Board board, String title, String content,
                 int viewCount, int likeCount, int dislikeCount, int commentCount,
                 int scrapCount, boolean isAnonymous, String nickname) {
        this.id = id;
        this.user = user;
        this.board = board;
        this.title = title;
        this.content = content;
        this.viewCount = viewCount;
        this.likeCount = likeCount;
        this.dislikeCount = dislikeCount;
        this.commentCount = commentCount;
        this.scrapCount = scrapCount;
        this.isAnonymous = isAnonymous;
        this.nickname = nickname != null ? nickname : "익명";
    }
}
