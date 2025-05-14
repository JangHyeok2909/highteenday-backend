package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.services.school.SchoolMealService;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SchoolMealInitializer implements CommandLineRunner {

    private final SchoolMealService schoolMealService;
    private final SchoolRepository schoolRepository;

    @Override
    public void run(String... args) {
        // 모든 학교에 대해 급식 정보 불러오기
        schoolRepository.findAll().forEach(school -> {
            try {
                String schoolCode = String.valueOf(school.getCode());
                String eduOfficeCode = school.getEduOfficeCode();
                schoolMealService.loadMealsForSchool(schoolCode, eduOfficeCode);
            } catch (Exception e) {
                System.err.println("급식 정보 로딩 실패: " + e.getMessage());
            }
        });
    }
}