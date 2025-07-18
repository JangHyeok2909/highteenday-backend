package com.example.highteenday_backend.security;

import com.example.highteenday_backend.enums.ErrorCode;

public class TokenException extends CustomException {
    public TokenException(ErrorCode errorCode) {
        super(errorCode);
    }
}
