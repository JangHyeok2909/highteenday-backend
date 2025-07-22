package com.example.highteenday_backend.domain.schools;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface SchoolScheduleRepository extends JpaRepository<SchoolSchedule, Long> {
    List<SchoolSchedule> findBySchoolIdAndGradeAndClassNumberAndMajorAndDate(
            Long schoolId, Integer grade, Integer classNumber, String major, LocalDate date);

    List<SchoolSchedule> findBySchoolIdAndGradeAndClassNumberAndMajorAndDateBetween(
            Long schoolId, Integer grade, Integer classNumber, String major, LocalDate startDate, LocalDate endDate);
}
