package com.example.highteenday_backend.domain.port;

import java.time.Duration;
import java.util.Optional;

public interface TokenCachePort {

    void put(String refreshToken, String email, Duration ttl);

    Optional<String> get(String refreshToken);

    void delete(String refreshToken);
}
