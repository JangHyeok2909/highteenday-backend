package com.example.highteenday_backend.domain.scraps;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ScarpRepository extends JpaRepository<Scrap, Long> {
}
