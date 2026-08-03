package com.example.highteenday_backend.enums;

/**
 * 열람자와 대상 사용자의 관계. 프로필 카드가 어떤 동작을 열어줄지 이 값으로 정한다.
 *
 * 상대가 나를 차단한 경우는 여기에 값이 없다. 별도 상태로 내보내면 "차단당했다"는 사실이
 * 드러나는데, 차단은 상대가 알 수 없어야 한다는 것이 기존 정책이다(FriendController 참고).
 * 그런 관계는 NONE으로 보이고, 실제 동작(친구 요청 등)에서만 거절된다.
 */
public enum RelationStatus {
    SELF,
    FRIEND,
    REQUEST_SENT,
    REQUEST_RECEIVED,
    NONE
}
