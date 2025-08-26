package com.example.highteenday_backend.dtos.Verification;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public record VerifyCodeDto(
    String phoneNum,
    String verifyCode
) {}