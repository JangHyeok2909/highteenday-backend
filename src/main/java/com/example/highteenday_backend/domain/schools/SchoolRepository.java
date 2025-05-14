package com.example.highteenday_backend.domain.schools;


import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SchoolRepository extends JpaRepository<School,Long> {
    Optional<School> findByCode(Integer code);
    boolean existsByCode(Integer code);  // 중복 학교 코드 확인
}
