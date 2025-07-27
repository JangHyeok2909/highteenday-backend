package com.example.highteenday_backend.domain.posts;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HotPostRepository extends JpaRepository<HotPost, Long> {

}
