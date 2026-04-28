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
//    매월 1일 자정 실행
    @Scheduled(cron = "0 0 0 1 * ?")
    public void loadSchoolMeals(){
        LocalDate now = LocalDate.now();
        int year = now.getYear();
        int month = now.getMonthValue();

        schoolMealService.loadAllSchoolMealsForMonth(year, month);
        schoolMealService.importMealsFromJson(year, month);
    }

}
