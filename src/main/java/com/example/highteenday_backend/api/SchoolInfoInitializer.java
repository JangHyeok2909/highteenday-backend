package com.example.highteenday_backend.api;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Order(1)
@Component
@RequiredArgsConstructor
public class SchoolInfoInitializer implements CommandLineRunner {

    private final SchoolInfoService schoolInfoService;

//  애플리케이션 시작 시 학교 정보 로드
    @Override
    public void run(String... args) throws Exception {
//        schoolInfoService.loadAllSchools();
        schoolInfoService.importSchoolsFromJson();

    }
}
