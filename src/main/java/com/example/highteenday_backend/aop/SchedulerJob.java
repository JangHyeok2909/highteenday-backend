package com.example.highteenday_backend.aop;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * @Scheduled 메서드에 선언하면 {@link SchedulerJobAspect}가
 * 실행 시작/종료/소요시간을 로깅하고, 미처리 예외를 ERROR로 기록한 뒤 rethrow 한다.
 *
 *
 *
 * scheduler lifecycle 관측(observability)을 단일 지점에서 관리
 * 예외를 삼키지 않으므로 APM·alerting 시스템이 실패를 감지할 수 있음
 * Spring TaskScheduler의 기본 ErrorHandler가 예외를 안전하게 처리하므로,
 * rethrow해도 스케줄러 스레드가 종료되지 않음
 *
 *
 * 로그 전략
 * 최상위 호출자로서 예외의 full stacktrace를 출력한다.
 * 따라서 하위 계층(service, repository)에서는 동일 예외를 중복 출력하지 않도록 한다.
 * 하위 계층은 contextual 정보만 남기고 log.warn("skipped postId={}", id), stacktrace 출력은 이 aspect에 위임한다.
 * 이 원칙을 지키지 않으면 장애 시 동일 stacktrace가 여러 번 출력되어
 * 로그 노이즈가 증가하고 근본 원인 추적이 어려워진다.
 *
 *
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface SchedulerJob {

    /**
     * 로그에 표시할 job 식별자.
     * 비어 있으면 메서드 이름을 사용한다.
     * grep·로그 검색을 위해 명시적으로 지정하는 것을 권장.
     */
    String name() default "";
}
