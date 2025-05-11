package com.example.highteenday_backend.domain.Token;

import com.example.highteenday_backend.domain.users.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter
@AllArgsConstructor
public class Token {
    @Id
    @OneToOne
    @JoinColumn(name = "id")
    private User user;
    @Column(name = "TNK_refresh", unique = true)
    private String refreshToken;
    @Column(name = "TNK_access", unique = true)
    private String accessToken;

    public Token updateRefreshToken(String refreshToken){
        this.refreshToken = refreshToken;
        return this;
    }
    public void updateAccessToken(String accessToken){
        this.accessToken = accessToken;
    }
}
