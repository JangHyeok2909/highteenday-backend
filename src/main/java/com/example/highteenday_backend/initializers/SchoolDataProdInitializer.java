package com.example.highteenday_backend.initializers;

import com.example.highteenday_backend.api.SchoolInfoService;
import com.example.highteenday_backend.api.SchoolMealInitializer;
import com.example.highteenday_backend.constants.SchoolFileConstants;
import com.example.highteenday_backend.domain.schools.SchoolMealRepository;
import com.example.highteenday_backend.domain.schools.SchoolRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.File;
import java.time.LocalDate;

@Slf4j
@Profile("prod")
@Component
@RequiredArgsConstructor
public class SchoolDataProdInitializer {

    private final SchoolInfoService schoolInfoService;
    private final SchoolRepository schoolRepository;
    private final SchoolMealRepository schoolMealRepository;
    private final SchoolMealInitializer schoolMealInitializer;

    @EventListener(ApplicationReadyEvent.class)
    public void importSchoolsIfEmpty() {
        if (schoolRepository.count() == 0) {
            log.info("No school data found. Importing from schools.json...");
            schoolInfoService.loadAllSchools();
            schoolInfoService.importSchoolsFromJson();
            log.info("School data import complete. count={}", schoolRepository.count());
        }
        LocalDate now = LocalDate.now();
        int year = now.getYear();
        int month = now.getMonthValue();
        String mealJsonPath = SchoolFileConstants.getMealJsonPath(year, month);
        File file = new File(mealJsonPath);
        if(schoolMealRepository.count() == 0 && file.exists()){

            if(file.exists()){
                log.info("No meal data found. Importing from meals.json...");
                schoolMealInitializer.saveToDbFromJson();
                log.info("Meal data initial load complete. year={}, month={}", year, month);
            } else{
                schoolMealInitializer.loadDataAndSaveToDb();
            }

        }
    }
}
