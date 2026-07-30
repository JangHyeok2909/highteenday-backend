package com.example.highteenday_backend.domain.Token;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface TokenRepository extends JpaRepository<Token, Long> {
    Optional<Token> findByAccessToken(String accessToken);

    Optional<Token> findByRefreshToken(String refreshToken);

    Optional<Token> findByUser(User user);

    void deleteByUser(User user);

    @Modifying
    @Query("DELETE FROM Token t WHERE t.expiresAt < :now")
    void deleteAllExpired(@Param("now") LocalDateTime now);
}
