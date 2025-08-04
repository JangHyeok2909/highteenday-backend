package com.example.highteenday_backend.api;

import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.SchoolService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

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
