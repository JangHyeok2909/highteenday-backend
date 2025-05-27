package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.services.school.SchoolMealService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Component
@RequiredArgsConstructor
public class SchoolMealInitializer implements CommandLineRunner {

    private final SchoolMealService schoolMealService;

    //현재 날짜 기준 1달 급식정보 얻기 위해 localdate 사용
    @Override
    public void run(String... args) {
        LocalDate now = LocalDate.now();
        int year = now.getYear();
        int month = now.getMonthValue();

        System.out.println("=== 급식 데이터 초기 로딩 시작 ===");
        schoolMealService.loadAllSchoolMealsForMonth(year, month);
        System.out.println("=== 급식 데이터 초기 로딩 완료 ===");
    }
}