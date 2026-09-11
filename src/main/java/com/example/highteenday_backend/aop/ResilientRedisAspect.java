package com.example.highteenday_backend.aop;

import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

import java.util.*;

@Aspect
@Component
@Slf4j
public class ResilientRedisAspect {

    /**
     * {@link ResilientRedis}가 붙은 메서드에서 Redis 접근 오류가 발생하면
     * 예외 대신 반환 타입에 맞는 기본값을 돌려준다.
     *
     * <p>리프레시 토큰과 같은 민감정보가 노출될 수 있으므로 메서드 인자는 로그에
     * 남기지 않는다. Redis 오류로 변환된 {@link DataAccessException}만 처리하며,
     * NPE와 같은 코드 오류는 숨기지 않고 호출자에게 그대로 전달한다.</p>
     *
     * @param joinPoint 원래 메서드의 호출 정보
     * @param resilientRedis 호출된 메서드에 선언된 애너테이션
     * @return 원래 메서드의 반환값 또는 Redis 접근 실패 시 반환 타입의 기본값
     * @throws Throwable Redis 접근 실패가 아닌 예외가 원래 메서드에서 발생한 경우
     */
    @Around("@annotation(resilientRedis)")
    public Object handle(ProceedingJoinPoint joinPoint, ResilientRedis resilientRedis) throws Throwable {
        try {
            return joinPoint.proceed();
        } catch (DataAccessException e) {
            String methodName = joinPoint.getSignature().toShortString();
            log.warn("Redis unavailable, skipping {}. cause={}: {}",
                    methodName, e.getClass().getSimpleName(), e.getMostSpecificCause().getMessage());
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
