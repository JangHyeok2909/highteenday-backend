package com.example.highteenday_backend.schedulers;


import com.example.highteenday_backend.api.SchoolMealService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Slf4j
@RequiredArgsConstructor
@Component
public class SchoolMealScheduler {
    private final SchoolMealService schoolMealService;
//    매월 말일 새벽3시 실행
    @Scheduled(cron = "0 0 3 L * ?")
    public void loadSchoolMeals(){
        LocalDate now = LocalDate.now();
        int year = now.getYear();
        int nextMonth = now.getMonthValue() + 1;

        // 월 증가에 따른 년도 처리
        if (nextMonth == 13) {
            year += 1;
            nextMonth = 1;
        }
        schoolMealService.loadAllSchoolMealsForMonth(year, nextMonth);
    }

}
