package com.example.highteenday_backend.exceptions;

import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.persistence.EntityNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.validation.BindException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 전역 예외 → HTTP 응답 변환.
 *
 * <p><b>응답 본문에 내부 예외 메시지를 싣지 않는다.</b> 예전에는 400/403/404/405/409 는 물론
 * <b>500 응답에도</b> {@code e.getMessage()} 를 그대로 이어 붙였다. 그 문자열에는 테이블·컬럼
 * 이름, 클래스 이름, 제약 조건 이름 같은 내부 구현이 그대로 들어 있어 공격자에게 스키마를
 * 알려 주는 통로가 됐다 (docs/KNOWN-ISSUES.md KI-13). 이제 클라이언트는 코드별 고정
 * 문구만 받고, 원인 문자열은 서버 로그에만 남는다.
 *
 * <p>예외는 {@link CustomException} 이다. 이쪽은 <b>개발자가 직접 쓴</b> 상세 메시지이므로
 * 응답에 싣는다. 예전에는 {@code ErrorCode} 의 기본 메시지만 써서, 상세를 넣어도 조용히
 * 사라졌다 — 던지는 쪽은 전달됐다고 믿는데 클라이언트는 못 받는 상태였다.
 */
@Hidden
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    private static ResponseEntity<Map<String, Object>> body(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(Map.of("code", code, "message", message));
    }

    /**
     * 도메인 예외. 상세 메시지가 있으면 그것을, 없으면 ErrorCode 기본 메시지를 내보낸다.
     *
     * 상세 메시지를 응답에 실어도 되는 이유: 현재 상세를 붙이는 자리는 모두 고정 문구이거나
     * <b>호출자가 방금 보낸 값</b>(email·nickname·commentId)을 되돌려 주는 것뿐이라, 클라이언트가
     * 모르던 정보가 새로 나가지 않는다. 새로 상세를 붙일 때 이 조건을 지킬 것.
     */
    @ExceptionHandler(CustomException.class)
    public ResponseEntity<?> handleCustomException(CustomException e){
        HttpStatus status = e.getErrorCode().getHttpStatus();
        // 5xx 는 실제 장애이므로 스택까지 남긴다. 4xx 는 정상 시나리오라 한 줄이면 된다.
        if (status.is5xxServerError()) {
            log.error("CustomException raised. code={}, detail={}", e.getErrorCode().name(), e.getMessage(), e);
        } else {
            log.warn("CustomException raised. code={}, detail={}", e.getErrorCode().name(), e.getMessage());
        }
        return ResponseEntity.status(status)
                .body(Map.of(
                        "code", e.getErrorCode().name(),
                        "message", e.getMessage()
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
        // 원인 문자열은 로그에만 남긴다. 본문 파싱 실패 메시지에는 DTO 클래스명과
        // 필드 경로가 그대로 들어 있다.
        log.warn("[400 Bad Request] {}: {}", e.getClass().getSimpleName(), e.getMessage());
        return body(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "잘못된 요청입니다.");
    }

    // 403 Forbidden: 권한 없음
    @ExceptionHandler({SecurityException.class})
    public ResponseEntity<?> handleForbidden(SecurityException e) {
        log.warn("[403 Forbidden] {}", e.getMessage());
        return body(HttpStatus.FORBIDDEN, "FORBIDDEN", "접근 권한이 없습니다.");
    }

    // 404 Not Found
    @ExceptionHandler({
            ResourceNotFoundException.class,
            NoSuchElementException.class,
            EntityNotFoundException.class,
            NoSuchKeyException.class,
            NoResourceFoundException.class
    })
    public ResponseEntity<?> handleNotFound(Exception e) {
        log.warn("[404 Not Found] {}: {}", e.getClass().getSimpleName(), e.getMessage());
        return body(HttpStatus.NOT_FOUND, "NOT_FOUND", "리소스를 찾을 수 없습니다.");
    }

    // 405 Method Not Allowed: 매핑되지 않은 HTTP 메서드로 요청한 경우
    @ExceptionHandler({HttpRequestMethodNotSupportedException.class})
    public ResponseEntity<?> handleMethodNotAllowed(HttpRequestMethodNotSupportedException e) {
        log.warn("[405 Method Not Allowed] {}", e.getMessage());
        return body(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "지원하지 않는 요청 방식입니다.");
    }

    // 409 Conflict (예: 중복 데이터 등)
    @ExceptionHandler({DataIntegrityViolationException.class})
    public ResponseEntity<?> handleConflict(Exception e) {
        // 이 메시지에는 제약 조건 이름과 컬럼명이 들어 있다 — 절대 내보내지 않는다.
        log.warn("[409 Conflict] {}", e.getMessage());
        return body(HttpStatus.CONFLICT, "CONFLICT", "요청 충돌이 발생했습니다.");
    }

    // 500 Internal Server Error: 그 외 예상치 못한 예외
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleInternalServerError(Exception e) {
        log.error("[500 Internal Server Error] {}", e.getMessage(), e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "서버 내부 오류가 발생했습니다.");
    }

    /**
     * Bean Validation 실패. 어느 필드가 왜 틀렸는지는 클라이언트가 고칠 수 있는 정보이므로
     * 필드별로 돌려준다 — 이것이 검증 실패를 알리는 정식 통로다.
     */
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
