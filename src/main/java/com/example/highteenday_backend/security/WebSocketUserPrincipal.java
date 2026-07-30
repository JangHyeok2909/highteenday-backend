package com.example.highteenday_backend.security;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

// STOMP 세션 Principal — getName()이 userId를 반환한다.
// convertAndSendToUser("{userId}", ...)의 사용자 목적지 해석이 이 이름과 맞아야 하는데,
// CustomUserPrincipal은 UserDetails라 기본 getName()이 getUsername()(=실명)으로 풀려 중복 위험이 있다.
// UsernamePasswordAuthenticationToken을 상속하므로 기존 (Authentication)/(UsernamePasswordAuthenticationToken)
// 캐스팅과 getPrincipal() 사용처는 그대로 동작한다.
public class WebSocketUserPrincipal extends UsernamePasswordAuthenticationToken {

    private final String name;

    public WebSocketUserPrincipal(Authentication source, Long userId) {
        super(source.getPrincipal(), source.getCredentials(), source.getAuthorities());
        this.name = String.valueOf(userId);
    }

    @Override
    public String getName() {
        return name;
    }
}
