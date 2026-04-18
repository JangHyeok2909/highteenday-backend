package com.example.highteenday_backend.exceptions;

import com.amazonaws.services.kms.model.NotFoundException;
import com.amazonaws.services.s3.model.AmazonS3Exception;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.persistence.EntityNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.net.BindException;
import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;

@Hidden
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {
    @ExceptionHandler(CustomException.class)
    public ResponseEntity<?> handleCustomException(CustomException e){
        log.warn("CustomException raised. code={}, message={}", e.getErrorCode().name(), e.getErrorCode().getMessage());
        return ResponseEntity.status(e.getErrorCode().getHttpStatus())
                .body(Map.of(
                        "code", e.getErrorCode().name(),
                        "message", e.getErrorCode().getMessage()
                ));
    }
    // 400 Bad Request: 유효성 검사 실패, 잘못된 요청 파라미터
    @ExceptionHandler({
            BindException.class,
            MissingServletRequestParameterException.class,
            HttpMessageNotReadableException.class,
            IllegalArgumentException.class
    })
    public ResponseEntity<?> handleBadRequest(Exception e) {
        log.warn("[400 Bad Request] {}", e.getMessage());
        return ResponseEntity.badRequest().body(Map.of(
                "code", "BAD_REQUEST",
                "message", e.getMessage()
        ));
    }
    // 403 Forbidden: 권한 없음
    @ExceptionHandler({SecurityException.class})
    public ResponseEntity<?> handleForbidden(SecurityException e) {
        log.warn("[403 Forbidden] {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "code", "FORBIDDEN",
                "message", "접근 권한이 없습니다."+" message="+e.getMessage()
        ));
    }
    // 404 Not Found
    @ExceptionHandler({
            ResourceNotFoundException.class,
            NoSuchElementException.class,
            EntityNotFoundException.class,
            AmazonS3Exception.class,
            NoResourceFoundException.class
    })
    public ResponseEntity<?> handleNotFound(Exception e) {
        log.warn("[404 Not Found] {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                "code", "NOT_FOUND",
                "message", "리소스를 찾을 수 없습니다."+" message="+e.getMessage()
        ));
    }
    // 409 Conflict (예: 중복 데이터 등)
    @ExceptionHandler({DataIntegrityViolationException.class})
    public ResponseEntity<?> handleConflict(Exception e) {
        log.warn("[409 Conflict] {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                "code", "CONFLICT",
                "message", "요청 충돌이 발생했습니다."+" message="+e.getMessage()
        ));
    }

    // 500 Internal Server Error: 그 외 예상치 못한 예외
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleInternalServerError(Exception e) {
        log.error("[500 Internal Server Error] {}", e.getMessage(), e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "code", "INTERNAL_SERVER_ERROR",
                "message", "서버 내부 오류가 발생했습니다."+" message="+e.getMessage()
        ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> handleValidation(MethodArgumentNotValidException e) {

        Map<String, String> errors = new HashMap<>();

        e.getBindingResult().getFieldErrors()
                .forEach(err -> errors.put(err.getField(), err.getDefaultMessage()));

        Map<String, Object> response = new HashMap<>();
        response.put("code", "VALIDATION_ERROR");
        response.put("errors", errors);

        return ResponseEntity.badRequest().body(response);
    }
}
