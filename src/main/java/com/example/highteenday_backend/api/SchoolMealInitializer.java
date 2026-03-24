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

        log.info("급식 데이터 초기 로딩 시작. year={}, month={}", year, month);
        schoolMealService.loadAllSchoolMealsForMonth(year, month);
        log.info("급식 데이터 초기 로딩 완료. year={}, month={}", year, month);
    }
}