package com.example.highteenday_backend.domain.schedule;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PersonalScheduleRepository extends JpaRepository<PersonalSchedule, Long> {
    List<PersonalSchedule> findByUserId(Long userId);
    Optional<PersonalSchedule> findByIdAndUserId(Long id, Long userId);
}
