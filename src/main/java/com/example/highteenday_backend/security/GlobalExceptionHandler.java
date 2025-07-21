package com.example.highteenday_backend.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

//@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(CustomException.class)
    public ResponseEntity<?> handleCustomException(CustomException e){
        System.out.println("❌ CustomException 발생: { " + e.getErrorCode().getMessage() + " }");
        return ResponseEntity.status(e.getErrorCode().getHttpStatus())
                .body(Map.of(
                        "code", e.getErrorCode().name(),
                        "message", e.getErrorCode().getMessage()
                ));
    }
}
