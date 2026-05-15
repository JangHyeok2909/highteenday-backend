package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.domain.Token.TokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
@Slf4j
public class TokenCleanupScheduler {

    private final TokenRepository tokenRepository;

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void deleteExpiredTokens() {
        tokenRepository.deleteAllExpired(LocalDateTime.now());
        log.info("Expired refresh tokens cleaned up from DB.");
    }
}
