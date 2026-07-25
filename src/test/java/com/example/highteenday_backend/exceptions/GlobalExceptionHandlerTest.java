package com.example.highteenday_backend.exceptions;

import com.example.highteenday_backend.enums.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;

import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 에러 응답이 내부 예외 메시지를 노출하지 않는지 검증한다.
 * 프레임워크 예외 메시지에는 SQL 전문, 컬럼명, 내부 클래스 경로가 포함된다.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    /** DataIntegrityViolationException이 실제로 담고 있는 형태의 메시지. */
    private static final String LEAKY_SQL_MESSAGE =
            "could not execute statement [Unique index or primary key violation: "
                    + "\"PUBLIC.UK_USERS_EMAIL_INDEX_4 ON PUBLIC.USERS(USR_EMAIL)\"; SQL statement: "
                    + "insert into users (usr_email,usr_hashed_password,usr_phone,usr_id) values (?,?,?,default)]";

    @Test
    @DisplayName("409 응답에 실패한 SQL 문장과 제약조건명이 포함되지 않는다")
    void conflictResponseHidesSql() {
        ResponseEntity<?> response = handler.handleConflict(
                new DataIntegrityViolationException(LEAKY_SQL_MESSAGE));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(body(response))
                .containsEntry("code", "CONFLICT")
                .containsEntry("message", "요청 충돌이 발생했습니다.");
        assertThat(body(response).toString())
                .doesNotContain("insert into", "USR_EMAIL", "UK_USERS_EMAIL", "SQL statement");
    }

    @Test
    @DisplayName("500 응답에 예외 메시지와 클래스 이름이 포함되지 않는다")
    void internalErrorResponseHidesExceptionDetail() {
        // 이 서비스에서 실제로 클라이언트까지 노출됐던 메시지
        Exception cause = new ClassCastException(
                "class java.lang.Long cannot be cast to class java.lang.Boolean");

        ResponseEntity<?> response = handler.handleInternalServerError(cause);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(body(response)).containsEntry("message", "서버 내부 오류가 발생했습니다.");
        assertThat(body(response).toString())
                .doesNotContain("java.lang.Long", "cannot be cast", "ClassCastException");
    }

    @Test
    @DisplayName("400 응답에 Jackson 파싱 오류 원문이 포함되지 않는다")
    void badRequestResponseHidesParserDetail() {
        ResponseEntity<?> response = handler.handleBadRequest(
                new HttpMessageNotReadableException(
                        "JSON parse error: Cannot deserialize value of type "
                                + "`com.example.highteenday_backend.dtos.RequestPostDto` from String"));

        assertThat(body(response)).containsEntry("message", "올바르지 않은 요청입니다.");
        assertThat(body(response).toString())
                .doesNotContain("com.example.highteenday_backend", "deserialize");
    }

    @Test
    @DisplayName("404 응답에 내부 조회 실패 메시지가 포함되지 않는다")
    void notFoundResponseHidesLookupDetail() {
        ResponseEntity<?> response = handler.handleNotFound(
                new ResourceNotFoundException("post does not exist, postId=4821"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(body(response).toString()).doesNotContain("postId=4821", "does not exist");
    }

    @Test
    @DisplayName("CustomException은 ErrorCode의 상태/코드/문구를 그대로 사용한다")
    void customExceptionKeepsErrorCodeContract() {
        ResponseEntity<?> response = handler.handleCustomException(
                new CustomException(ErrorCode.NO_ACCESS, "postId=1 requesterId=2"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(body(response))
                .containsEntry("code", "NO_ACCESS")
                .containsEntry("message", ErrorCode.NO_ACCESS.getMessage());
        // 호출부가 넘긴 상세 문구는 로그 전용이며 응답에 나가지 않는다.
        assertThat(body(response).toString()).doesNotContain("requesterId");
    }

    @Test
    @DisplayName("모든 에러 응답은 로그 추적용 traceId를 포함한다")
    void everyErrorResponseCarriesTraceId() {
        Stream.of(
                handler.handleCustomException(new CustomException(ErrorCode.NO_ACCESS)),
                handler.handleBadRequest(new IllegalArgumentException("x")),
                handler.handleForbidden(new SecurityException("x")),
                handler.handleNotFound(new ResourceNotFoundException("x")),
                handler.handleMethodNotAllowed(new HttpRequestMethodNotSupportedException("PUT")),
                handler.handleConflict(new DataIntegrityViolationException("x")),
                handler.handleInternalServerError(new RuntimeException("x"))
        ).forEach(response -> assertThat(body(response))
                .as("응답: %s", body(response))
                .containsKey("traceId"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> body(ResponseEntity<?> response) {
        return (Map<String, Object>) response.getBody();
    }
}
