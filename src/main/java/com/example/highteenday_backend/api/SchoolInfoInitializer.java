package com.example.highteenday_backend.api;

import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.SchoolService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

// test 프로파일에서는 돌지 않는다. 학교 데이터 적재는 테스트 컨텍스트가 감당할 일이 아니다.
@Profile("!prod & !test")
@Component
@RequiredArgsConstructor
public class SchoolInfoInitializer {

    private final SchoolInfoService schoolInfoService;
    private final SchoolService schoolService;
    @EventListener(ApplicationReadyEvent.class)
    public void schoolInit() {

        schoolInfoService.loadAllSchools();
        schoolInfoService.importSchoolsFromJson();

    }
}
