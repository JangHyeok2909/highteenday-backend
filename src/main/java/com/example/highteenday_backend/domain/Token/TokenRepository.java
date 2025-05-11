package com.example.highteenday_backend.domain.Token;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TokenRepository extends JpaRepository<Token, String> {
    Optional<Token> findByAccessToken(String accessToken);

    Optional<Token> findByUser(User user);
}
