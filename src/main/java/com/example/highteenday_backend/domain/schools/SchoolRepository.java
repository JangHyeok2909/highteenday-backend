package com.example.highteenday_backend.domain.schools;


import com.example.highteenday_backend.enums.SchoolCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SchoolRepository extends JpaRepository<School,Long> {
    List<School> findByCategory(SchoolCategory category);
    Optional<School> findByCode(Integer code);
    boolean existsByCode(Integer code);  // 중복 학교 코드 확인

    List<School> findByNameContaining(String name);
}
