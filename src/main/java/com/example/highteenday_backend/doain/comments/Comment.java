package com.example.highteenday_backend.doain.comments;


import com.example.highteenday_backend.doain.base.BaseEntity;
import com.example.highteenday_backend.doain.posts.Post;
import com.example.highteenday_backend.doain.users.User;
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

    @Column(name = "CMT_content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "CMT_like_count")
    private Integer likeCount = 0;

    @Column(name = "CMT_report_count")
    private Integer reportCount = 0;

    @Column(name = "CMT_image_url", columnDefinition = "TEXT")
    private String imageUrl;
}
