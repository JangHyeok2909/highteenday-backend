package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.services.school.SchoolInfoService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SchoolInfoInitializer implements CommandLineRunner {

    private final SchoolInfoService schoolInfoService;

    @Override
    public void run(String... args) throws Exception {
        // 애플리케이션 시작 시 학교 정보 로드
        schoolInfoService.loadAllSchools();
    }
}
