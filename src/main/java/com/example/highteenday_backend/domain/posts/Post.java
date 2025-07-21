package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.PostDto;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "posts")
@Entity
public class Post extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "PST_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false)
    private User user; // 작성자

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "BRD_id", nullable = false)
    private Board board; // 게시판

    @Column(name = "PST_title", length = 50, nullable = false)
    private String title;

    //html 형식 그대로 저장
    @Column(name = "PST_content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Builder.Default
    @Column(name = "PST_view_count", nullable = false)
    private int viewCount = 0;
    @Builder.Default
    @Column(name = "PST_like_count")
    private int likeCount = 0;
    @Builder.Default
    @Column(name = "PST_dislike_count")
    private int dislikeCount = 0;
    @Builder.Default
    @Column(name = "PST_comment_count", nullable = false)
    private int commentCount = 0;
    @Builder.Default
    @Column(name = "PST_is_anonymous", nullable = false)
    private boolean isAnonymous=true;

//    @Column(name = "PST_report_count")
//    private int reportCount = 0;

    public void updateLikeCount(int likeCount){
        this.likeCount = likeCount;
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

    public PostDto toDto() {
        String nickname="";
        if (!this.isAnonymous) nickname = user.getNickname();
        return PostDto.builder()
                .author(nickname)
                .userId(user.getId())
                .title(title)
                .content(content)
                .viewCount(viewCount)
                .likeCount(likeCount)
                .commentCount(commentCount)
                .isAnonymous(isAnonymous)
                .isLiked(false)
                .isDisliked(false)
                .isScraped(false)
                .createdAt(super.getCreated())
                .build();
    }


}
