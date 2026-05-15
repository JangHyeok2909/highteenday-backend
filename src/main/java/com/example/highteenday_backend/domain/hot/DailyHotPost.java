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
@Table(
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
