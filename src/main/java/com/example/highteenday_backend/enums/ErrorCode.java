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
    ALREADY_FRIENDS(CONFLICT, "이미 친구입니다."),
    FRIEND_REQUEST_RECEIVED_ALREADY(CONFLICT, "상대방이 이미 친구 요청을 보냈습니다. 받은 요청에서 수락해주세요."),
    BLOCKED_USER(CONFLICT, "차단한 사용자입니다. 차단을 해제한 뒤 다시 시도해주세요."),
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

    // comment
    COMMENT_NOT_FOUND(NOT_FOUND, "댓글을 찾을 수 없습니다."),

    // school
    SCHOOL_NOT_ASSIGNED(BAD_REQUEST, "급식 조회를 위해 학교 배정이 필요합니다."),

    // timetable
    TIMETABLE_TEMPLATE_NOT_FOUND(NOT_FOUND, "시간표 템플릿을 찾을 수 없습니다."),
    DEFAULT_TIMETABLE_TEMPLATE_NOT_FOUND(NOT_FOUND, "기본으로 설정된 시간표가 없습니다."),

    // friend
    FRIEND_NOT_FOUND(NOT_FOUND, "친구 관계가 아닙니다."),

    // chat
    CHAT_ROOM_NOT_FOUND(NOT_FOUND, "채팅방을 찾을 수 없습니다."),
    CHAT_NOT_PARTICIPANT(FORBIDDEN, "채팅방 참가자가 아닙니다."),
    CHAT_NOT_FRIENDS(BAD_REQUEST, "친구 관계가 아닌 사용자와 채팅할 수 없습니다."),
    CHAT_ROOM_ALREADY_EXISTS(CONFLICT, "이미 해당 사용자와의 채팅방이 존재합니다."),
    CHAT_ROOM_FULL(BAD_REQUEST, "채팅방 정원이 가득 찼습니다."),
    CHAT_NO_PERMISSION(FORBIDDEN, "채팅방에 대한 권한이 없습니다."),
    CHAT_CANNOT_KICK_OWNER(BAD_REQUEST, "방장은 강퇴할 수 없습니다."),
    CHAT_CANNOT_KICK_SELF(BAD_REQUEST, "자기 자신은 강퇴할 수 없습니다. 나가기를 이용해주세요."),
    CHAT_ALREADY_PARTICIPANT(CONFLICT, "이미 참여 중인 사용자입니다."),
    CHAT_NOT_GROUP_ROOM(BAD_REQUEST, "단체 채팅방이 아닙니다."),
    CHAT_INVALID_MEMBER_COUNT(BAD_REQUEST, "단체 채팅방은 초대할 멤버가 1명 이상이어야 합니다."),
    CHAT_INVALID_ROOM_NAME(BAD_REQUEST, "채팅방 이름은 1~30자여야 합니다."),
    CHAT_EMPTY_MESSAGE(BAD_REQUEST, "빈 메시지는 전송할 수 없습니다.")
    ;

    private final HttpStatus httpStatus;
    private final String message;
}