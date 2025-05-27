package com.example.highteenday_backend.domain.schools;

import com.example.highteenday_backend.enums.SchoolMealCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;

public interface SchoolMealRepository extends JpaRepository<SchoolMeal, Long> {
    boolean existsBySchoolAndDateAndCategory(School school, LocalDate date, SchoolMealCategory category);
}