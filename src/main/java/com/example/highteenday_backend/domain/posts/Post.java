package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.users.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
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

    @Builder.Default
    @Column(name = "PST_view_count")
    private int viewCount = 0;
    @Builder.Default
    @Column(name = "PST_like_count")
    private int likeCount = 0;
    @Builder.Default
    @Column(name = "PST_dislike_count")
    private int dislikeCount = 0;
    @Builder.Default
    @Column(name = "PST_comment_count")
    private int commentCount = 0;
    @Builder.Default
    @Column(name = "PST_scrap_count")
    private int scrapCount = 0;
    @Builder.Default
    @Column(name = "PST_is_anonymous")
    private boolean isAnonymous=true;

    /*@Builder.Default
    @Version
    @Column(name = "version", nullable = false)
    @ColumnDefault("0")
    private long version = 0L;*/

    //쿼리 성능을 위한 비정규화 컬럼
    @Builder.Default
    @Column(name = "USR_nickname", length = 12, nullable = false)
    private String nickname="익명";

    public void updateLikeCount(int likeCount){
        this.likeCount = likeCount;
    }
    public void updateDislike(int dislikeCount){
        this.dislikeCount = dislikeCount;
    }
    public void updateTitle(String title){
        this.title = title;
    }
    public void updateContent(String content){
        this.content = content;
    }

    public void plusLikeCount(){
        this.likeCount++;
    }
    public void minusLikeCount(){
        this.likeCount--;
    }
    public void plusDislikeCount(){
        this.dislikeCount++;
    }
    public void minusDislikeCount(){
        this.dislikeCount--;
    }
    public void plusCommentCount(){
        this.commentCount++;
    }
    public void minusCommentCount(){
        this.commentCount--;
    }
    public void addViewCount(int increment){
        this.viewCount+=increment;
    }
    public void updateCommentCount(int commentCount){
        this.commentCount = commentCount;
    }
    public void updateAnonymous(boolean isAnonymous){
        this.isAnonymous = isAnonymous;
    }
    public void plusScrapCount(){
        this.scrapCount++;
    }
    public void minusScrapCount(){
        this.scrapCount--;
    }
    public void updateScrapCount(int scrapCount){
        this.scrapCount = scrapCount;
    }
    public void minusScrapCount(int scrapCount){
        this.scrapCount-=scrapCount;
    }



}
