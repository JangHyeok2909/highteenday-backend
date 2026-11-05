package com.example.highteenday_backend.aop;

import com.example.highteenday_backend.services.domain.NotificationFailureService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Component;

@Aspect
@Component
@Slf4j
@RequiredArgsConstructor
@Order(Ordered.LOWEST_PRECEDENCE - 2)
public class AsyncNotificationAspect {

    @Qualifier("notificationExecutor")
    private final TaskExecutor notificationExecutor;
    private final NotificationFailureService notificationFailureService;
    private final ObjectMapper objectMapper;

    @Around("@annotation(asyncNotification)")
    public Object handle(ProceedingJoinPoint joinPoint, AsyncNotification asyncNotification) {
        Class<?> returnType = ((MethodSignature) joinPoint.getSignature()).getReturnType();
        if (returnType != void.class && returnType != Void.class) {
            throw new IllegalStateException(
                    "@AsyncNotification is only applicable to void methods. " +
                    "Found return type: " + returnType.getName() +
                    " on method: " + joinPoint.getSignature().toShortString()
            );
        }

        String payload = serializeFirstArg(joinPoint);

        notificationExecutor.execute(() -> {
            try {
                joinPoint.proceed();
            } catch (Throwable e) {
                log.warn("Async notification failed. eventType={}, method={}",
                        asyncNotification.eventType(),
                        joinPoint.getSignature().toShortString(), e);
                notificationFailureService.recordFailure(
                        asyncNotification.eventType(), payload, e);
            }
        });

        return null;
    }

    private String serializeFirstArg(ProceedingJoinPoint joinPoint) {
        Object[] args = joinPoint.getArgs();
        if (args == null || args.length == 0) {
            return "{}";
        }
        try {
            return objectMapper.writeValueAsString(args[0]);
        } catch (Exception e) {
            log.warn("Failed to serialize event for failure recording. method={}",
                    joinPoint.getSignature().toShortString(), e);
            return "{}";
        }
    }
}
