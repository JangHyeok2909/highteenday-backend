package com.example.highteenday_backend.security;


import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.OAuth2UserInfo;
import com.example.highteenday_backend.enums.Provider;
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

import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.*;
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
    private final UserRepository userRepository;

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
        System.out.println("Authorities: {}" + authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList()));
        CustomUserPrincipal principal = (CustomUserPrincipal) authentication.getPrincipal();
        String userKey = principal.getUser() != null ? principal.getUser().getEmail() : (String) principal.getAttributes().get("email");

        boolean isGuest = authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_GUEST"));

        if(isGuest){
            return;
        }

        String refreshToken = generateToken(authentication, REFRESH_TOKEN_EXPIRE_TIME);
        tokenService.saveOrUpdate(userKey, refreshToken, accessToken);
    }
    // 생성 로직
    private String generateToken(Authentication authentication, long expireTime){
        Date now = new Date();
        Date expiredDate = new Date(now.getTime() + expireTime);
        String email = "", name = "", provider = "";

        String authorities = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.joining(","));

        CustomUserPrincipal customUserPrincipal = (CustomUserPrincipal) authentication.getPrincipal();

        return Jwts.builder()
                .setSubject(customUserPrincipal.getUser().getEmail())
                .claim(KEY_ROLE, authorities)
                .claim("name", customUserPrincipal.getUser().getName())
                .claim("provider", customUserPrincipal.getUser().getProvider())
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

        String email = claims.getSubject();
        String role = claims.get("role", String.class);
        String name = claims.get("name", String.class);
        String providerStr = claims.get("provider", String.class);
        Provider provider = Provider.valueOf((providerStr));

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("email", email);
        attributes.put("name", name);
        attributes.put("provider", provider);

        if ("ROLE_GUEST".equals(role)) {
            OAuth2UserInfo oAuth2UserInfo = new OAuth2UserInfo(name, email, provider);
            CustomUserPrincipal principal = new CustomUserPrincipal(oAuth2UserInfo, attributes, role);

            return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("유저 없음"));

        CustomUserPrincipal principal = new CustomUserPrincipal(user, attributes, role);

        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
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

//    토큰 검증 메소드 수정중 // jjwt 빌드 문제인지 최신 메소드 : parserBuilder() 가 안떠서 코딩 보류 중
//    public boolean validateToken(String token){
//        try{
//            Claims claims = Jwts.parser()
//                    .setSigningKey(secretKey)
//                    .parseClaimsJws(token)
//                    .getBody();
//
//        }
//
//
//        return false;
//    }

}
