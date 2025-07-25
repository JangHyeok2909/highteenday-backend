package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.schedule.PersonalSchedule;
import com.example.highteenday_backend.domain.schedule.PersonalScheduleRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.PersonalScheduleRequest;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PersonalScheduleService {

    private final PersonalScheduleRepository personalScheduleRepository;
    private final UserRepository userRepository;

    public List<PersonalSchedule> getSchedulesByUser(Long userId) {
        return personalScheduleRepository.findByUserId(userId);
    }

    @Transactional
    public PersonalSchedule addSchedule(Long userId, PersonalScheduleRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        PersonalSchedule schedule = PersonalSchedule.builder()
                .user(user)
                .date(request.getDate())
                .content(request.getContent())
                .isFinished(false)
                .month(request.getDate().withDayOfMonth(1))
                .week(request.getDate().with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY)))
                .day(request.getDate())
                .build();

        return personalScheduleRepository.save(schedule);
    }

    @Transactional
    public PersonalSchedule markAsFinished(Long userId, Long scheduleId) {
        PersonalSchedule schedule = personalScheduleRepository.findByIdAndUserId(scheduleId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Schedule not found or unauthorized"));

        schedule.setIsFinished(true);
        return schedule;
    }

    @Transactional
    public void deleteSchedule(Long userId, Long scheduleId) {
        PersonalSchedule schedule = personalScheduleRepository.findByIdAndUserId(scheduleId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Schedule not found or unauthorized"));

        personalScheduleRepository.delete(schedule);
    }
}
