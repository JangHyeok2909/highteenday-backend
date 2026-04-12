package com.example.highteenday_backend.initializers;

import com.example.highteenday_backend.api.SchoolInfoService;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Slf4j
@Profile("prod")
@Component
@RequiredArgsConstructor
public class SchoolDataProdInitializer {

    private final SchoolInfoService schoolInfoService;
    private final SchoolRepository schoolRepository;

    @EventListener(ApplicationReadyEvent.class)
    public void importSchoolsIfEmpty() {
        if (schoolRepository.count() > 0) {
            log.info("School data already exists, skipping import.");
            return;
        }
        log.info("No school data found. Importing from schools.json...");
        schoolInfoService.importSchoolsFromJson();
        log.info("School data import complete. count={}", schoolRepository.count());
    }
}
