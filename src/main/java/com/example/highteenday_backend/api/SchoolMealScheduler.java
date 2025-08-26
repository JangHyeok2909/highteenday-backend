package com.example.highteenday_backend.api;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Component
@RequiredArgsConstructor
public class SchoolMealScheduler {

    private final SchoolMealApiClient apiClient;
    private final SchoolMealJsonLoader jsonLoader;

    // 매달 1일 새벽 1시에 실행
    @Scheduled(cron = "0 0 1 1 * ?")
    public void updateNextMonthMeals() {
        LocalDate nextMonth = LocalDate.now().plusMonths(1);
        int year = nextMonth.getYear();
        int month = nextMonth.getMonthValue();

        System.out.println("=== 다음달 급식 데이터 갱신 시작 ===");

        apiClient.fetchAndSaveMeals(year, month);
        jsonLoader.loadMealsFromJson(year, month);

        System.out.println("=== 다음달 급식 데이터 갱신 완료 ===");
    }
}