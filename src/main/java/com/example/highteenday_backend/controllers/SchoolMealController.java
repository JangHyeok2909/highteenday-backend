package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.dtos.SchoolMealDto;
import com.example.highteenday_backend.enums.SchoolMealCategory;
import com.example.highteenday_backend.services.school.SchoolMealService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/school/meal")
@RequiredArgsConstructor
public class SchoolMealController {

    private final SchoolMealService schoolMealService;
//GET /meals/date?date=2025-05-30&schoolId=1
//GET /meals/week?date=2025-05-30&schoolId=1
//GET /meals/month?date=2025-05-30&schoolId=1
//    형식으로 데이터 받으면 해당 급식 나옴

    @GetMapping("/date")
    public List<SchoolMealDto> getMealsByDate(
            @RequestParam LocalDate date,
            @RequestParam Long schoolId
    ) {
        return schoolMealService.getMealsByDate(date, schoolId);
    }

    @GetMapping("/week")
    public List<SchoolMealDto> getMealsByWeek(
            @RequestParam LocalDate date,
            @RequestParam Long schoolId
    ) {
        return schoolMealService.getMealsByWeek(date, schoolId);
    }

    @GetMapping("/month")
    public List<SchoolMealDto> getMealsByMonth(
            @RequestParam LocalDate date,
            @RequestParam Long schoolId
    ) {
        return schoolMealService.getMealsByMonth(date, schoolId);
    }
}