package com.example.highteenday_backend.aop;

import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;

import java.util.*;

@Aspect
@Component
@Slf4j
public class ResilientRedisAspect {

    @Around("@annotation(resilientRedis)")
    public Object handle(ProceedingJoinPoint joinPoint, ResilientRedis resilientRedis) throws Throwable {
        try {
            return joinPoint.proceed();
        } catch (Exception e) {
            String methodName = joinPoint.getSignature().toShortString();
            log.warn("Redis unavailable, skipping {}. args={}", methodName, joinPoint.getArgs(), e);
            return defaultValue(((MethodSignature) joinPoint.getSignature()).getReturnType());
        }
    }

    private Object defaultValue(Class<?> returnType) {
        if (returnType == void.class || returnType == Void.class) return null;
        if (returnType == boolean.class || returnType == Boolean.class) return false;
        if (returnType == int.class || returnType == Integer.class) return 0;
        if (returnType == long.class || returnType == Long.class) return 0L;
        if (returnType == double.class || returnType == Double.class) return 0.0;
        if (List.class.isAssignableFrom(returnType)) return Collections.emptyList();
        if (Set.class.isAssignableFrom(returnType)) return Collections.emptySet();
        if (Map.class.isAssignableFrom(returnType)) return Collections.emptyMap();
        return null;
    }
}
