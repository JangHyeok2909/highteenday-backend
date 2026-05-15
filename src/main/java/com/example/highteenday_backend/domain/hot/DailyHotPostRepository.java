package com.example.highteenday_backend.domain.hot;

import com.example.highteenday_backend.domain.posts.Post;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface DailyHotPostRepository extends JpaRepository<DailyHotPost, Long> {

    Optional<DailyHotPost> findByPostAndLeaderboardDate(Post post, LocalDate leaderboardDate);

    List<DailyHotPost> findTop10ByLeaderboardDateOrderByCreatedDesc(LocalDate leaderboardDate);
}
