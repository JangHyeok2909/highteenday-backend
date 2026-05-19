package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.services.global.FileStoragePort;
import com.example.highteenday_backend.services.global.LocalFileStorageAdapter;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration
public class TestFileStorageConfig {

    @Bean
    @Primary
    public FileStoragePort fileStoragePort() {
        return new LocalFileStorageAdapter();
    }
}
