package com.example.highteenday_backend.security;


import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class TokenProvider {
//    @Value("${jwt.key}")
//    private String key;
//    private SecretKey secretKey;
//
//    private static final long ACCESS_TOKEN_EXPIRE_TIME = 1000 * 60 * 30L; // 30분
//    private static final long REFRESH_TOKEN_EXPIRE_TIME = 1000 * 60 * 60L * 24 * 7; // 7일
//    private static final String KEY_ROLE = "role";
//
//    private final TokenService tokenService;
//
//    public String generateAccessToken(Authentication authentication){
//        return generateToken(authentication, ACCESS_TOKEN_EXPIRE_TIME);
//    }
//
//    private String generateToken(Authentication authentication, long expireTime){
//        Date now = new Date();
//        Date expiredDate = new Date(now.getTime() + expireTime);
//
//        String authorities = authentication.getAuthorities().stream()
//                .map(GrantedAuthority::getAuthority)
//                .collect(Collectors.joining());
//
//        return "";
//    }

}
