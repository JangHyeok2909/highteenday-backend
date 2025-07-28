package com.example.highteenday_backend.domain.hot;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RecentHotPostRepository extends JpaRepository<RecentHotPost, Long> {
}
