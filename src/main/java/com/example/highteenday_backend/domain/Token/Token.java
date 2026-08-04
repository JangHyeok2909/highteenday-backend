package com.example.highteenday_backend.domain.Token;

import com.example.highteenday_backend.domain.users.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Builder
@Entity
@Getter
@AllArgsConstructor
@NoArgsConstructor
// @Table을 빠뜨리면 Hibernate 기본 네이밍이 클래스명 Token을 token으로 바꿔 쿼리하는데,
// 실제 테이블명은 그것과 달라 대소문자를 구분하는 MySQL(Linux 기본값)에서 인증 기능 전체가
// 죽는다. V5에서 테이블명을 tokens로 통일했으므로 여기서도 명시한다.
//
// unique 제약은 @Column(unique=true)가 아니라 여기에 이름을 붙여 선언한다. @Column에 두면
// Hibernate가 UK7b8qtgtp36hq6dk0a5g317493 같은 무작위 이름을 만들어 환경마다 달라진다.
@Table(
        name = "tokens",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_tokens_access", columnNames = "TNK_access"),
                @UniqueConstraint(name = "uk_tokens_refresh", columnNames = "TNK_refresh"),
                @UniqueConstraint(name = "uk_tokens_usr", columnNames = "USR_id")
        })
public class Token {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "TNK_id")
    private Long id;

    @OneToOne
    @JoinColumn(name = "USR_id", foreignKey = @ForeignKey(name = "fk_tokens_usr"))
    private User user;

    // 토큰 길이 다시 검토, ( 길이 줄일지 | 유니크를 없에고 검증 로직 추가할지 )
    @Column(name = "TNK_refresh", length = 500)
    private String refreshToken;
    @Column(name = "TNK_access", length = 500)
    private String accessToken;

    @Column(name = "TNK_expires_at")
    private LocalDateTime expiresAt;

    public Token updateRefreshToken(String refreshToken, LocalDateTime expiresAt){
        this.refreshToken = refreshToken;
        this.expiresAt = expiresAt;
        return this;
    }
    public void updateAccessToken(String accessToken){
        this.accessToken = accessToken;
    }
}
