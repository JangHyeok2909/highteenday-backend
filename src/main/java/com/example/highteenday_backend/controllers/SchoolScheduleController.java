package com.example.highteenday_backend.controllers;



import com.example.highteenday_backend.dtos.SchoolScheduleResponseDto;
import com.example.highteenday_backend.services.school.SchoolScheduleService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/schedule")
@RequiredArgsConstructor
public class SchoolScheduleController {

    private final SchoolScheduleService scheduleService;

    @GetMapping("/day")
    public List<SchoolScheduleResponseDto> getDaySchedule(
            @RequestParam Long schoolId,
            @RequestParam Integer grade,
            @RequestParam Integer classNumber,
            @RequestParam String major,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {

        return scheduleService.getDailySchedule(schoolId, grade, classNumber, major, date);
    }

    @GetMapping("/week")
    public List<SchoolScheduleResponseDto> getWeekSchedule(
            @RequestParam Long schoolId,
            @RequestParam Integer grade,
            @RequestParam Integer classNumber,
            @RequestParam String major,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {

        return scheduleService.getWeeklySchedule(schoolId, grade, classNumber, major, date);
    }

    @GetMapping("/month")
    public List<SchoolScheduleResponseDto> getMonthSchedule(
            @RequestParam Long schoolId,
            @RequestParam Integer grade,
            @RequestParam Integer classNumber,
            @RequestParam String major,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {

        return scheduleService.getMonthlySchedule(schoolId, grade, classNumber, major, date);
    }
}
