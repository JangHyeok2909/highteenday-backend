package com.example.highteenday_backend.domain.Token;

import com.example.highteenday_backend.domain.users.User;
import jakarta.persistence.*;
import lombok.*;

@Builder
@Entity
@Getter
@AllArgsConstructor
@NoArgsConstructor
public class Token {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne
    @JoinColumn(name = "id")
    private User user;

    // 토큰 길이 다시 검토, ( 길이 줄일지 | 유니크를 없에고 검증 로직 추가할지 )
    @Column(name = "TNK_refresh", length = 500, unique = true)
    private String refreshToken;
    @Column(name = "TNK_access", length = 500, unique = true)
    private String accessToken;

    public Token updateRefreshToken(String refreshToken){
        this.refreshToken = refreshToken;
        return this;
    }
    public void updateAccessToken(String accessToken){
        this.accessToken = accessToken;
    }
}
