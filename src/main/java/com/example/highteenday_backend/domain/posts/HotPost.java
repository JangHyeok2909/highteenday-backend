package com.example.highteenday_backend.domain.posts;


import com.example.highteenday_backend.domain.base.BaseEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Builder
@Getter
@AllArgsConstructor
@NoArgsConstructor
@Table(name= "hot_posts")
@Entity
public class HotPost extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "PST_id", nullable = false)
    private Post post;
    private double score;
    private LocalDateTime rank_time;

}
