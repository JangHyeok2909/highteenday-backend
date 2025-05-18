package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.services.school.SchoolScheduleService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SchoolScheduleInitializer implements CommandLineRunner {

    private final SchoolScheduleService schoolScheduleService;

    @Override
    public void run(String... args) {
        schoolScheduleService.loadAllSchoolSchedules();
    }
}