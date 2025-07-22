package com.example.highteenday_backend.enums;

import static org.springframework.http.HttpStatus.*;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {
    // auth
    ILLEGAL_REGISTRATION_ID(NOT_ACCEPTABLE, "illegal registration id"),
    TOKEN_EXPIRED(UNAUTHORIZED, "토큰이 만료되었습니다."),
    TOKEN_NOT_FOUND(UNAUTHORIZED, "Access Token 이 쿠키에 없습니다."),
    INVALID_TOKEN(UNAUTHORIZED, "올바르지 않은 토큰입니다."),
    INVALID_JWT_SIGNATURE(UNAUTHORIZED, "잘못된 JWT 시그니처입니다."),


    // global
    RESOURCE_LOCKED(LOCKED, "자원이 잠겨있어 접근할 수 없습니다."),
    NO_ACCESS(FORBIDDEN, "접근 권한이 없습니다."),
    RESOURCE_NOT_FOUND(NOT_FOUND, "요청한 자원을 찾을 수 없습니다."),
    INVALID_REQUEST(BAD_REQUEST, "올바르지 않은 요청입니다."),
    INTERNAL_ERROR(INTERNAL_SERVER_ERROR, "예상치못한 내부 에러가 발생했습니다."),

    // user
    INVALID_PASSWORD(UNAUTHORIZED, "비밀번호가 올바르지 않습니다."),
    ALREADY_EXISTS_USER(CONFLICT, "이미 가입된 유저입니다."),
    USER_NOT_FOUND(NOT_FOUND, "존재하지 않는 사용자입니다."),
    ALREADY_SENT_FRIEND_REQUEST(CONFLICT, "이미 친구신청을 보냈습니다."),
    REQUEST_NOT_FOUND(NOT_FOUND, "친구 요청이 존재하지 않습니다."),
    DATA_INTEGRITY_ERROR(CONFLICT, "데이터 무결성 위반"),
    DATABASE_ERROR(INTERNAL_SERVER_ERROR, "데이터베이스 오류"),
    SAME_AS_CURRENT_PASSWORD(BAD_REQUEST, "현재 비밀번호와 동일한 비밀번호입니다."),
    SAME_AS_NICKNAME(BAD_REQUEST, "현재 닉네임과 동일한 닉네임입니다."),
    DUPLICATE_NICKNAME(CONFLICT, "이미 사용 중인 닉네임입니다."),
    INVALID_NICKNAME_FORMAT(BAD_REQUEST, "올바르지 않은 닉네임 형식입니다."),
    ;

    private final HttpStatus httpStatus;
    private final String message;
}