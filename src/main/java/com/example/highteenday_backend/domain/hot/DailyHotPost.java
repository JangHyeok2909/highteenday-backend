package com.example.highteenday_backend.domain.hot;

import com.example.highteenday_backend.domain.base.BaseEntity;
import com.example.highteenday_backend.domain.posts.Post;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Entity
// name 을 빠뜨리면 Hibernate 기본 네이밍이 클래스명 DailyHotPost 를 daily_hot_post 로
// 바꾸는데, V1__baseline.sql 이 만든 테이블은 DailyHotPost(언더스코어 없음)라 이름 자체가
// 달랐다. 대소문자 문제가 아니므로 lower_case_table_names 로도 가려지지 않아 신선한 DB 에서는
// /api/hotposts/daily 가 항상 500 이었다. V6 에서 daily_hot_post 로 통일했으므로 명시한다.
@Table(
    name = "daily_hot_post",
    uniqueConstraints = @UniqueConstraint(name = "uk_daily_hot_post_date_post", columnNames = {"DHP_leaderboard_date", "PST_id"}),
    indexes = @Index(name = "idx_daily_hot_post_date_created", columnList = "DHP_leaderboard_date, created_at DESC")
)
public class DailyHotPost extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "DHP_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PST_id", nullable = false, foreignKey = @ForeignKey(name = "fk_daily_hot_post_pst"))
    private Post post;

    @Column(name = "DHP_score", nullable = false)
    private double score;

    @Column(name = "DHP_leaderboard_date", nullable = false)
    private LocalDate leaderboardDate;

}
