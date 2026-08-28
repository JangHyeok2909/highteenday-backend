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
     * Redis 접근 실패를 삼키고 반환 타입의 기본값을 돌려준다.
     *
     * <p><b>인자를 로그에 남기지 않는다.</b> 예전에는 {@code joinPoint.getArgs()} 를
     * 그대로 찍었는데, {@code RedisTokenCacheStore.put/delete} 의 첫 인자가 리프레시
     * 토큰 원문이라 Redis 장애가 나면 <b>유효한 토큰이 로그 파일에 평문으로 남았다</b>
     * (docs/KNOWN-ISSUES.md KI-18). 어떤 인자가 민감한지는 호출 지점마다 다르므로
     * 마스킹 규칙을 두는 대신 인자 자체를 찍지 않는다 — 장애 원인 파악에는 메서드
     * 이름과 예외로 충분하다.
     *
     * <p><b>{@link DataAccessException} 만 잡는다.</b> 예전의 {@code catch (Exception)} 은
     * Redis 접속 오류가 아닌 코드 버그(NPE 등)까지 "Redis unavailable" 로 위장해
     * 삼켰다. 스프링 데이터 Redis 는 Lettuce 예외를 {@code RedisConnectionFailureException}
     * ·{@code RedisSystemException} 등 {@code DataAccessException} 계열로 번역하므로,
     * 이 계열만 잡으면 진짜 인프라 장애와 코드 버그가 갈린다. 버그는 이제 그대로
     * 위로 올라가 500 으로 드러난다.
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
