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
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.net.BindException;
import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * 모든 에러 응답의 단일 진입점.
 *
 * <p>응답 본문에는 예외 메시지를 절대 넣지 않는다. 프레임워크 예외 메시지에는 SQL 문장,
 * 컬럼명, 내부 클래스 경로가 그대로 담기기 때문이다(예: DataIntegrityViolationException은
 * 실패한 INSERT 전문을 포함한다). 대신 요청마다 traceId를 발급해 응답과 서버 로그 양쪽에
 * 남기고, 실제 원인은 로그에서만 확인한다.
 */
@Hidden
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(CustomException.class)
    public ResponseEntity<?> handleCustomException(CustomException e) {
        String traceId = newTraceId();
        // ErrorCode 기본 메시지가 아니라 호출부가 넘긴 상세 메시지를 남겨야 원인 추적이 가능하다.
        log.warn("[{}] CustomException. code={}, detail={}", traceId, e.getErrorCode().name(), e.getMessage());
        return errorResponse(e.getErrorCode().getHttpStatus(), e.getErrorCode().name(),
                e.getErrorCode().getMessage(), traceId);
    }

    // 400 Bad Request: 유효성 검사 실패, 잘못된 요청 파라미터
    @ExceptionHandler({
            BindException.class,
            MissingServletRequestParameterException.class,
            HttpMessageNotReadableException.class,
            IllegalArgumentException.class
    })
    public ResponseEntity<?> handleBadRequest(Exception e) {
        String traceId = newTraceId();
        log.warn("[{}] 400 Bad Request. type={}, detail={}", traceId, e.getClass().getSimpleName(), e.getMessage());
        return errorResponse(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "올바르지 않은 요청입니다.", traceId);
    }

    // 403 Forbidden: 권한 없음
    @ExceptionHandler({SecurityException.class})
    public ResponseEntity<?> handleForbidden(SecurityException e) {
        String traceId = newTraceId();
        log.warn("[{}] 403 Forbidden. detail={}", traceId, e.getMessage());
        return errorResponse(HttpStatus.FORBIDDEN, "FORBIDDEN", "접근 권한이 없습니다.", traceId);
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
        String traceId = newTraceId();
        log.warn("[{}] 404 Not Found. type={}, detail={}", traceId, e.getClass().getSimpleName(), e.getMessage());
        return errorResponse(HttpStatus.NOT_FOUND, "NOT_FOUND", "리소스를 찾을 수 없습니다.", traceId);
    }

    // 405 Method Not Allowed: 매핑되지 않은 HTTP 메서드로 요청한 경우
    @ExceptionHandler({HttpRequestMethodNotSupportedException.class})
    public ResponseEntity<?> handleMethodNotAllowed(HttpRequestMethodNotSupportedException e) {
        String traceId = newTraceId();
        log.warn("[{}] 405 Method Not Allowed. detail={}", traceId, e.getMessage());
        return errorResponse(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED",
                "지원하지 않는 요청 방식입니다.", traceId);
    }

    // 409 Conflict (예: 중복 데이터 등)
    @ExceptionHandler({DataIntegrityViolationException.class})
    public ResponseEntity<?> handleConflict(DataIntegrityViolationException e) {
        String traceId = newTraceId();
        // 이 예외의 메시지에는 실패한 SQL 전문과 제약조건명이 들어있어 응답에 노출하면 안 된다.
        log.warn("[{}] 409 Conflict. detail={}", traceId, e.getMostSpecificCause().getMessage());
        return errorResponse(HttpStatus.CONFLICT, "CONFLICT", "요청 충돌이 발생했습니다.", traceId);
    }

    // 500 Internal Server Error: 그 외 예상치 못한 예외
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleInternalServerError(Exception e) {
        String traceId = newTraceId();
        log.error("[{}] 500 Internal Server Error", traceId, e);
        return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR",
                "서버 내부 오류가 발생했습니다.", traceId);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> handleValidation(MethodArgumentNotValidException e) {
        // 필드 검증 메시지는 우리가 직접 작성한 사용자용 문구이므로 그대로 내려준다.
        Map<String, String> errors = new HashMap<>();
        e.getBindingResult().getFieldErrors()
                .forEach(err -> errors.put(err.getField(), err.getDefaultMessage()));

        String traceId = newTraceId();
        log.warn("[{}] 400 Validation Error. fields={}", traceId, errors.keySet());

        Map<String, Object> response = new HashMap<>();
        response.put("code", "VALIDATION_ERROR");
        response.put("message", "입력값을 확인해주세요.");
        response.put("errors", errors);
        response.put("traceId", traceId);

        return ResponseEntity.badRequest().body(response);
    }

    private ResponseEntity<Map<String, Object>> errorResponse(HttpStatus status, String code,
                                                              String message, String traceId) {
        return ResponseEntity.status(status).body(Map.of(
                "code", code,
                "message", message,
                "traceId", traceId
        ));
    }

    /** 사용자에게 보여줄 수 있을 만큼 짧으면서 로그에서 검색 가능한 식별자. */
    private String newTraceId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
