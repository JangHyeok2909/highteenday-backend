package com.example.highteenday_backend.security;


import com.example.highteenday_backend.dtos.OAuth2UserInfo;
import com.example.highteenday_backend.services.security.TokenService;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
@Slf4j
public class TokenProvider {
    @Value("${jwt.key}")
    private String key;
    private SecretKey secretKey;

    private static final long ACCESS_TOKEN_EXPIRE_TIME = 1000 * 60 * 30L; // 30분
    private static final long REFRESH_TOKEN_EXPIRE_TIME = 1000 * 60 * 60L * 24 * 7; // 7일
    private static final String KEY_ROLE = "role";

    private final TokenService tokenService;

    @PostConstruct
    private void settSecretKey() {
        secretKey = Keys.hmacShaKeyFor(key.getBytes());
    }

    // accessToken 발급
    public String generateAccessToken(Authentication authentication){
        return generateToken(authentication, ACCESS_TOKEN_EXPIRE_TIME);
    }
    // refreshToken 발급
    public void generateRefreshToken(Authentication authentication, String accessToken){
        boolean isGuest = authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_GUEST"));

        if(isGuest){
            return;
        }

        String refreshToken = generateToken(authentication, REFRESH_TOKEN_EXPIRE_TIME);
        tokenService.saveOrUpdate(authentication.getName(), refreshToken, accessToken);
    }
    // 생성 로직
    private String generateToken(Authentication authentication, long expireTime){
        Date now = new Date();
        Date expiredDate = new Date(now.getTime() + expireTime);

        String authorities = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.joining(","));

        OAuth2UserInfo oAuth2User = (OAuth2UserInfo) authentication.getPrincipal();

        return Jwts.builder()
                .setSubject(oAuth2User.email())
                .claim(KEY_ROLE, authorities)
                .claim("name", oAuth2User.name())
                .claim("provider", oAuth2User.provider())
                .setIssuedAt(now)
                .setExpiration(expiredDate)
                .signWith(secretKey, SignatureAlgorithm.HS512)
                .compact();
    }

    private List<SimpleGrantedAuthority> getAuthorities(Claims claims){
        return Collections.singletonList(new SimpleGrantedAuthority(claims.get(KEY_ROLE).toString()));
    }

    public Authentication getAuthentication(String token){
        Claims claims = parseClaims(token);

        OAuth2UserInfo oAuth2UserInfo = new OAuth2UserInfo(
                claims.get("name", String.class),           // 이름
                claims.getSubject(),                            // 이메일
                claims.get("provider", String.class)        // 제공자
        );
        List<SimpleGrantedAuthority> authorities = getAuthorities(claims);

        return new UsernamePasswordAuthenticationToken(oAuth2UserInfo, token, authorities);
    }


    // JWT에 페이로드(Claims)를 추출하는 부분 에러면 에러 리턴
    private Claims parseClaims(String token){
        try {
            return Jwts.parser().verifyWith(secretKey).build()
                    .parseSignedClaims(token).getPayload();
        } catch(ExpiredJwtException e){
            return e.getClaims();
        } catch(MalformedJwtException e){
            throw new RuntimeException("INVALID_TOKEN");
        } catch(SecurityException e){
            throw new RuntimeException("INVALID_JWT_SIGNATURE");
        }
    }

}
