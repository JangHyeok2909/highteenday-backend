package com.example.highteenday_backend.aop;

import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Controller·Service 레이어의 실행 시간을 자동으로 측정하는 aspect.
 *
 * 로그 전략
 * - 정상 완료: DEBUG — prod(INFO)에서는 출력되지 않아 로그 양 부담 없음
 * - Slow 요청 (threshold 초과): WARN — prod에서도 자동 노출
 * - 실패: WARN — stacktrace는 GlobalExceptionHandler에 위임
 *
 * 파라미터 로깅은 하지 않는다 — 비밀번호, 토큰 등 민감정보 노출 방지.
 */
@Aspect
@Component
@Slf4j
/*
 * SchedulerJobAspect(LOWEST_PRECEDENCE - 1)보다 바깥에 위치하여
 * transaction + scheduler 로깅을 모두 포함한 총 elapsed를 측정한다.
 */
@Order(Ordered.LOWEST_PRECEDENCE - 2)
public class ExecutionLoggingAspect {

    @Value("${app.execution-logging.slow-threshold-ms:100}")
    private long slowThresholdMs;

    // --- pointcuts ---

    @Pointcut("within(com.example.highteenday_backend.controllers..*)")
    private void controllerMethods() {}

    @Pointcut("within(com.example.highteenday_backend.services.domain..*)")
    private void serviceMethods() {}

    // --- advice ---

    @Around("controllerMethods()")
    public Object logController(ProceedingJoinPoint joinPoint) throws Throwable {
        return logExecution(joinPoint, "API");
    }

    @Around("serviceMethods()")
    public Object logService(ProceedingJoinPoint joinPoint) throws Throwable {
        return logExecution(joinPoint, "Service");
    }

    private Object logExecution(ProceedingJoinPoint joinPoint, String layer) throws Throwable {
        String method = joinPoint.getSignature().toShortString();
        long startNs = System.nanoTime();

        try {
            Object result = joinPoint.proceed();
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startNs);

            if (elapsedMs >= slowThresholdMs) {
                log.warn("[{}] Slow. method={}, elapsed={}ms", layer, method, elapsedMs);
            } else {
                log.debug("[{}] Completed. method={}, elapsed={}ms", layer, method, elapsedMs);
            }
            return result;
        } catch (Exception e) {
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startNs);
            log.warn("[{}] Failed. method={}, elapsed={}ms", layer, method, elapsedMs);
            throw e;
        }
    }
}
