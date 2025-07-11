package com.example.highteenday_backend.domain.comments;


import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.CommentDto;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "comments")
@Entity
public class Comment extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "CMT_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "USR_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PST_id", nullable = false)
    private Post post;

    // 대댓글: 자기 참조 관계
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CMT_parent_id")
    private Comment parent;

    @Column(name = "CMT_is_anonymus", nullable = false)
    private boolean isAnonymous = true;

    @Column(name = "CMT_content", length = 10000, nullable = false)
    private String content;

    @Column(name = "CMT_like_count")
    private Integer likeCount = 0;
    @Column(name = "CMT_dislike_count")
    private Integer dislikeCount = 0;

    @Column(name = "CMT_image_url",columnDefinition = "LONGTEXT")
    private String s3Url="";

//    @Column(name = "CMT_report_count")
//    private Integer reportCount = 0;

    public void updateContent(String content){
        this.content = content;
    }
    public void updateImage(String updateUrl){
        this.s3Url = updateUrl;
    }
    public void setParent(Comment parent){
        this.parent = parent;
    }
    public void plusLikeCount(){
        this.likeCount++;
    }
    public void plusDislikeCount(){
        this.dislikeCount++;
    }
    public void minusLikeCount(){
        this.likeCount--;
    }
    public void minusDislikeCount(){
        this.dislikeCount--;
    }
    public void deleteImage(){

    }

    public CommentDto toDto(){
        return CommentDto.builder()
                .id(this.id)
                .userId(user.getId())
                .author(this.user.getNickname())
                .content(this.content)
                .likeCount(this.likeCount)
                .isAnonymous(this.isAnonymous)
                .createdAt(super.getCreated())
                .url(s3Url)
                .build();
    }
}
