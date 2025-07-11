package com.example.highteenday_backend.dtos;

import lombok.Builder;
import org.springframework.security.core.AuthenticationException;

import java.util.Map;

@Builder
public record RegisterUserDto(
    String name,
    String email,
    String nickName,
    String provider
){}