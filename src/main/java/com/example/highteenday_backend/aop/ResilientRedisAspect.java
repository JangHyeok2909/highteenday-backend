package com.example.highteenday_backend.aop;

import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

import java.util.*;

/*
 * ExecutionLoggingAspect(LOWEST_PRECEDENCE - 2)보다 안쪽에 위치하여, 서킷이 호출을 즉시
 * 거절한 경우에도 그 소요 시간이 실행 로그에 잡히게 한다. 바깥에 두면 로그가 Redis 대기
 * 시간을 놓쳐 서킷의 효과가 로그에서 사라진다.
 */
@Aspect
@Component
@RequiredArgsConstructor
@Order(Ordered.LOWEST_PRECEDENCE)
public class ResilientRedisAspect {

    private final ResilientRedisExecutor executor;

    /**
     * {@link ResilientRedis}가 붙은 메서드를 서킷브레이커에 태우고, Redis 를 쓰지 못하면
     * 예외 대신 반환 타입에 맞는 기본값을 돌려준다.
     *
     * <p>서킷 판단, 폴백 계측, 로그는 모두 {@link ResilientRedisExecutor}가 한다. 이 advice 는
     * 폴백 값을 <b>반환 타입에서 유도</b>하는 부분만 맡는다. DB 조회 같은 값을 폴백으로 써야
     * 하는 메서드는 이 애너테이션 대신 executor 를 직접 부른다.</p>
     *
     * <p>Redis 오류로 변환된 {@link DataAccessException}만 폴백으로 처리하며, NPE 와 같은
     * 코드 오류는 숨기지 않고 호출자에게 그대로 전달한다.</p>
     *
     * @param joinPoint 원래 메서드의 호출 정보
     * @param resilientRedis 호출된 메서드에 선언된 애너테이션
     * @return 원래 메서드의 반환값 또는 Redis 를 쓰지 못할 때 반환 타입의 기본값
     * @throws Throwable Redis 접근 실패가 아닌 예외가 원래 메서드에서 발생한 경우
     */
    @Around("@annotation(resilientRedis)")
    public Object handle(ProceedingJoinPoint joinPoint, ResilientRedis resilientRedis) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        String method = signature.getDeclaringType().getSimpleName() + "." + signature.getName();
        return executor.executeChecked(method, joinPoint::proceed,
                () -> defaultValue(signature.getReturnType()));
    }

    private Object defaultValue(Class<?> returnType) {
        if (returnType == void.class || returnType == Void.class) return null;
        if (returnType == boolean.class || returnType == Boolean.class) return false;
        if (returnType == int.class || returnType == Integer.class) return 0;
        if (returnType == long.class || returnType == Long.class) return 0L;
        if (returnType == double.class || returnType == Double.class) return 0.0;
        if (returnType == Optional.class) return Optional.empty();
        if (List.class.isAssignableFrom(returnType)) return Collections.emptyList();
        if (Set.class.isAssignableFrom(returnType)) return Collections.emptySet();
        if (Map.class.isAssignableFrom(returnType)) return Collections.emptyMap();
        return null;
    }
}
