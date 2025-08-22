package com.example.highteenday_backend.initializers;

import com.example.highteenday_backend.api.SchoolInfoInitializer;
import com.example.highteenday_backend.api.SchoolMealInitializer;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AppStartupRunner {

    private final DataInitializer dataInitializer;
    private final SchoolInfoInitializer schoolInfoInitializer;
    private final SchoolMealInitializer schoolMealInitializer;
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        schoolInfoInitializer.schoolInit();
        dataInitializer.dataInit();
        schoolMealInitializer.schoolMealInit();
    }
}