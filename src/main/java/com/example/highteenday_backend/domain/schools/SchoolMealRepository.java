package com.example.highteenday_backend.domain.schools;

import com.example.highteenday_backend.enums.SchoolMealCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface SchoolMealRepository extends JpaRepository<SchoolMeal, Long> {
    boolean existsBySchoolAndDateAndCategory(School school, LocalDate date, SchoolMealCategory category);

    List<SchoolMeal> findByDateAndSchool(LocalDate date, School school);
    List<SchoolMeal> findByDateBetweenAndSchool(LocalDate start, LocalDate end, School school);
}