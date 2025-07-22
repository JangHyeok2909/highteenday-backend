package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.services.school.SchoolInfoService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Order(1)
@Component
@RequiredArgsConstructor
public class SchoolInfoInitializer /*implements CommandLineRunner*/ {

    private final SchoolInfoService schoolInfoService;

//  애플리케이션 시작 시 학교 정보 로드
//    @Override
//    public void run(String... args) throws Exception {
//        System.out.println("=== 전국 고등학교 데이터 초기 로딩 시작 ===");
//        schoolInfoService.loadAllSchools();
//        System.out.println("=== 전국 고등학교 데이터 초기 로딩 완료 ===");
//    }
}
