package com.example.highteenday_backend.api;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Slf4j
@Component
@RequiredArgsConstructor
public class SchoolMealInitializer {

    private final SchoolMealService schoolMealService;

    public void schoolMealInit() {
        LocalDate now = LocalDate.now();
        int year = now.getYear();
        int month = now.getMonthValue();

        log.info("Meal data initial load started. year={}, month={}", year, month);
        schoolMealService.loadAllSchoolMealsForMonth(year, month);
        schoolMealService.importMealsFromJson(year, month);
        log.info("Meal data initial load complete. year={}, month={}", year, month);
    }
}