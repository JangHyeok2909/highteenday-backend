package com.example.highteenday_backend.aop;

import com.example.highteenday_backend.enums.NotificationEventType;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * {@code @TransactionalEventListener} 메서드에 선언하면
 * {@link AsyncNotificationAspect}가 메서드 실행을 비동기 스레드 풀로 위임하고,
 * 실패 시 notification_failures 테이블에 자동 기록한다.
 *
 * <p>메서드의 첫 번째 인자(이벤트 객체)를 JSON으로 직렬화하여
 * 재시도 시 payload로 사용한다.</p>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface AsyncNotification {
    NotificationEventType eventType();
}
