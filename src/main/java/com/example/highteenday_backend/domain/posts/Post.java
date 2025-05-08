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

    @Column(name = "PST_content", columnDefinition = "TEXT", nullable = false)
    private String content;

    @Column(name = "PST_view_count", nullable = false)
    private int viewCount = 0;

    @Column(name = "PST_like_count", nullable = false)
    private int likeCount = 0;

    @Column(name = "PST_comment_count", nullable = false)
    private int commentCount = 0;

    @Column(name = "PST_is_anonymous", nullable = false)
    private boolean isAnonymous;

    @Column(name = "PST_report_count", nullable = false)
    private int reportCount = 0;
}
