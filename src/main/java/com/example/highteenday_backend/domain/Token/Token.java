package com.example.highteenday_backend.domain.Token;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@AllArgsConstructor
public class Token {
    @Id
    private String id;
    private String refreshToken;
    private String accessToken;

    public Token updateRefreshToken(String refreshToken){
        this.refreshToken = refreshToken;
        return this;
    }
    public void updateAccessToken(String accessToken){
        this.accessToken = accessToken;
    }
}
