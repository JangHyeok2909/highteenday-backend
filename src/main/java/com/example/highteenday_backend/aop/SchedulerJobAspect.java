package com.example.highteenday_backend.aop;

import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * {@link SchedulerJob} 어노테이션이 붙은 스케줄러 메서드의 실행을 감싸서
 * 작업 실행시간과 예외 로깅을 수행하는 aspect.
 */
@Aspect
@Component
@Slf4j
/*
 * @Order 값이 작을수록 advice chain에서 바깥(outer)에 위치하므로,
 * LOWEST_PRECEDENCE - 1 을 사용하면 이 aspect가 transaction advisor를
 * 감싸는 형태가 되어 commit/rollback 시간까지 포함한 elapsed를 측정한다.
 */
@Order(Ordered.LOWEST_PRECEDENCE - 1)
public class SchedulerJobAspect {

    @Around("@annotation(schedulerJob)")
    public Object handle(ProceedingJoinPoint joinPoint, SchedulerJob schedulerJob) throws Throwable {
        /*
         * @SchedulerJob은 void 메서드 전용.
         * void가 아닌 메서드에 사용하면 예외 경로에서 이 aspect가 의미 있는 값을
         * 반환할 수 없어 NullPointerException 등 2차 장애를 유발.
         */
        Class<?> returnType = ((MethodSignature) joinPoint.getSignature()).getReturnType();
        if (returnType != void.class && returnType != Void.class) {
            throw new IllegalStateException(
                    "@SchedulerJob is only applicable to void methods. " +
                    "Found return type: " + returnType.getName() +
                    " on method: " + joinPoint.getSignature().toShortString()
            );
        }

        String jobName = resolveJobName(schedulerJob, joinPoint);


        long startNs = System.nanoTime();

        log.info("[SchedulerJob] Starting. name={}", jobName);
        try {
            Object result = joinPoint.proceed();
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startNs);
            log.info("[SchedulerJob] Completed. name={}, elapsed={}ms", jobName, elapsedMs);
            return result;
        } catch (Exception e) { //Exception은 복구 가능한 애플리케이션 예외라 처리하지만, Error는 JVM 수준의 치명적 장애라 복구 불가능하므로 catch하지 않는다.
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startNs);
            log.error("[SchedulerJob] Failed. name={}, elapsed={}ms", jobName, elapsedMs, e);
            //Spring @Scheduled에서는 스케줄러가 예외를 이미 처리하므로, 예외를 삼키지 말고 rethrow해야 모니터링/에러 핸들러/APM으로 장애가 정상 전달된다.
            throw e;
        }
    }

    private String resolveJobName(SchedulerJob schedulerJob, ProceedingJoinPoint joinPoint) {
        String name = schedulerJob.name();
        if (name != null && !name.isBlank()) {
            return name;
        }
        return ((MethodSignature) joinPoint.getSignature()).getMethod().getName();
    }
}
