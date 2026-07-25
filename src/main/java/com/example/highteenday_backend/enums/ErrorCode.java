package com.example.highteenday_backend.enums;

import static org.springframework.http.HttpStatus.*;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {
    // auth
    ILLEGAL_REGISTRATION_ID(NOT_ACCEPTABLE, "Illegal registration ID."),
    TOKEN_EXPIRED(UNAUTHORIZED, "Token has expired."),
    TOKEN_NOT_FOUND(UNAUTHORIZED, "Access token not found in cookies."),
    INVALID_TOKEN(UNAUTHORIZED, "Invalid token."),
    INVALID_JWT_SIGNATURE(UNAUTHORIZED, "Invalid JWT signature."),


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
    DUPLICATE_PHONE(CONFLICT, "이미 사용 중인 전화번호입니다."),
    INVALID_NICKNAME_FORMAT(BAD_REQUEST, "닉네임은 2~12자여야 합니다."),
    INVALID_EMAIL_FORMAT(BAD_REQUEST, "유효하지 않은 이메일 형식입니다."),
    INVALID_PASSWORD_FORMAT(BAD_REQUEST, "비밀번호는 8자 이상, 숫자 1개 이상, 특수문자 1개 이상 포함해야 합니다."),
    INVALID_PHONE_FORMAT(BAD_REQUEST, "유효하지 않은 전화번호 형식입니다."),
    INVALID_NAME_FORMAT(BAD_REQUEST, "이름은 2~8자여야 합니다."),
    INVALID_BIRTHDATE(BAD_REQUEST, "생년월일은 15~30세 범위여야 합니다."),

    // school
    SCHOOL_NOT_ASSIGNED(BAD_REQUEST, "급식 조회를 위해 학교 배정이 필요합니다."),

    // friend
    FRIEND_NOT_FOUND(NOT_FOUND, "친구 관계가 아닙니다."),

    // chat
    CHAT_ROOM_NOT_FOUND(NOT_FOUND, "채팅방을 찾을 수 없습니다."),
    CHAT_NOT_PARTICIPANT(FORBIDDEN, "채팅방 참가자가 아닙니다."),
    CHAT_NOT_FRIENDS(BAD_REQUEST, "친구 관계가 아닌 사용자와 채팅할 수 없습니다."),
    CHAT_ROOM_ALREADY_EXISTS(CONFLICT, "이미 해당 사용자와의 채팅방이 존재합니다.")
    ;

    private final HttpStatus httpStatus;
    private final String message;
}