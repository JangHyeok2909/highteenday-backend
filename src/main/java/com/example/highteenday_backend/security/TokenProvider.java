package com.example.highteenday_backend.security;


import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.TokenPair;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.services.domain.TokenService;
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
    private final TokenService tokenService;
    private final UserRepository userRepository;


    private static final long ACCESS_TOKEN_EXPIRE_TIME = 1000 * 60 * 30L; // 30분
    private static final long REFRESH_TOKEN_EXPIRE_TIME = 1000 * 60 * 60L * 24 * 7; // 7일
    private static final String KEY_ROLE = "role";
    // Access·Refresh 토큰을 같은 키와 같은 클레임으로 만들므로, 종류를 클레임에 담아 용도 밖 사용을 막는다.
    // 이 클레임이 없을 때는 Refresh Token 을 accessToken 쿠키에 넣어도 인증 필터를 통과했다.
    private static final String KEY_TOKEN_TYPE = "token_type";
    private static final String TOKEN_TYPE_ACCESS = "access";
    private static final String TOKEN_TYPE_REFRESH = "refresh";


    @PostConstruct
    private void setSecretKey() {
        secretKey = Keys.hmacShaKeyFor(key.getBytes());
    }

    // accessToken 발급
    public String generateAccessToken(Authentication authentication){
        return generateToken(authentication, ACCESS_TOKEN_EXPIRE_TIME, TOKEN_TYPE_ACCESS);
    }
    // refreshToken 발급 — DB 역할이 GUEST 인 사용자면 null 반환(현재 GUEST 를 부여하는 가입 경로는 없다)
    public String generateRefreshToken(Authentication authentication, String accessToken){
        log.debug("Refresh token issued. authorities={}", authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList()));
        CustomUserPrincipal principal = (CustomUserPrincipal) authentication.getPrincipal();
        String userKey = principal.getUser() != null ? principal.getUser().getEmailValue() : (String) principal.getAttributes().get("email");

        boolean isGuest = authentication.getAuthorities().stream()
                .anyMatch(auth -> auth.getAuthority().equals("ROLE_GUEST"));

        if(isGuest){
            return null;
        }

        String refreshToken = generateToken(authentication, REFRESH_TOKEN_EXPIRE_TIME, TOKEN_TYPE_REFRESH);
        tokenService.saveOrUpdate(userKey, refreshToken, accessToken);
        return refreshToken;
    }

    // refreshToken 으로 accessToken + refreshToken 재발급 (rotation)
    public TokenPair reissueTokens(String refreshToken){
        // 1. 서명/만료와 토큰 종류(refresh) 검증
        Claims claims = parseClaims(refreshToken);
        requireTokenType(claims, TOKEN_TYPE_REFRESH);
        Authentication authentication = toAuthentication(claims);

        // 2. DB에 저장된 토큰인지 확인 (서버 측 폐기 여부 체크)
        tokenService.findByRefreshTokenOrThrow(refreshToken);

        // 3. 새 accessToken 발급
        String newAccessToken = generateAccessToken(authentication);

        // 4. 새 refreshToken 발급 + DB 갱신 (rotation)
        String newRefreshToken = generateRefreshToken(authentication, newAccessToken);

        return new TokenPair(newAccessToken, newRefreshToken);
    }
    // 생성 로직
    private String generateToken(Authentication authentication, long expireTime, String tokenType){
        Date now = new Date();
        Date expiredDate = new Date(now.getTime() + expireTime);
        String email = "", name = "", provider = "";

        String authorities = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.joining(","));

        CustomUserPrincipal customUserPrincipal = (CustomUserPrincipal) authentication.getPrincipal();

        return Jwts.builder()
                // iat/exp 는 초 단위라, 같은 사용자에게 같은 초에 두 번 발급하면 토큰
                // 문자열이 완전히 같아진다. 그러면 리프레시 토큰 rotation 이 무효가 되고
                // (옛 토큰이 그대로 유효) tokens 테이블의 UNIQUE 제약과도 부딪힌다.
                .setId(UUID.randomUUID().toString())
                .setSubject(customUserPrincipal.getUser().getEmailValue())
                .claim(KEY_ROLE, authorities)
                .claim("name", customUserPrincipal.getUser().getNameValue())
                .claim("provider", customUserPrincipal.getUser().getProvider())
                .claim(KEY_TOKEN_TYPE, tokenType)
                .setIssuedAt(now)
                .setExpiration(expiredDate)
                .signWith(secretKey, SignatureAlgorithm.HS512)
                .compact();
    }

    private List<SimpleGrantedAuthority> getAuthorities(Claims claims){
        return Collections.singletonList(new SimpleGrantedAuthority(claims.get(KEY_ROLE).toString()));
    }

    // Access Token 만 받는다. 인증 필터, WebSocket 인증, 사용자 API 가 이 메서드를 쓴다.
    public Authentication getAuthentication(String token){
        Claims claims = parseClaims(token);
        requireTokenType(claims, TOKEN_TYPE_ACCESS);
        return toAuthentication(claims);
    }

    // 종류 클레임이 기대값과 다르거나 없으면(이 변경 전에 발급된 토큰 포함) 무효 토큰으로 본다.
    private void requireTokenType(Claims claims, String expected){
        if (!expected.equals(claims.get(KEY_TOKEN_TYPE, String.class))) {
            throw new TokenException(ErrorCode.INVALID_TOKEN);
        }
    }

    private Authentication toAuthentication(Claims claims){
        String email = claims.getSubject();
        String role = claims.get("role", String.class);
        String name = claims.get("name", String.class);
        String providerStr = claims.get("provider", String.class);
        Provider provider = Provider.valueOf((providerStr));

        Map<String, Object> attributes = new HashMap<>();
        attributes.put("email", email);
        attributes.put("name", name);
        attributes.put("provider", provider);

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("유저 없음"));

        CustomUserPrincipal principal = new CustomUserPrincipal(user, attributes, false);

        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }


    // JWT에 페이로드(Claims)를 추출하는 부분 에러면 에러 리턴
    private Claims parseClaims(String token){
        try {
            return Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

        } catch (ExpiredJwtException e) {
            throw new TokenException(ErrorCode.TOKEN_EXPIRED);
        } catch (UnsupportedJwtException | MalformedJwtException e) {
            throw new TokenException(ErrorCode.INVALID_TOKEN);
        } catch (SignatureException e) {
            throw new TokenException(ErrorCode.INVALID_JWT_SIGNATURE);
        } catch (Exception e) {
            throw new TokenException(ErrorCode.INVALID_TOKEN);
        }
    }

}
