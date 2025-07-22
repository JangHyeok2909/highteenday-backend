package com.example.highteenday_backend.initializers;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AppStartupRunner {

    private final DataInitializer dataInitializer;

//    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        dataInitializer.dataInit();
    }
}