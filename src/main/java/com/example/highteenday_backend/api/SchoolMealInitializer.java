package com.example.highteenday_backend.api;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Component
@RequiredArgsConstructor
public class SchoolMealInitializer {

    private final SchoolMealService schoolMealService;

    public void schoolMealInit() {
        LocalDate now = LocalDate.now();
        int year = now.getYear();
        int month = now.getMonthValue();

        System.out.println("=== 급식 데이터 초기 로딩 시작 ===");
        schoolMealService.loadAllSchoolMealsForMonth(year, month);
        System.out.println("=== 급식 데이터 초기 로딩 완료 ===");
    }
}