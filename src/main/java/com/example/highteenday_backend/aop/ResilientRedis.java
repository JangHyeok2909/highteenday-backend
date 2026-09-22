package com.example.highteenday_backend.aop;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Redis 를 쓰지 못할 때 예외를 삼키고 반환 타입에 맞는 기본값을 반환한다.
 * void      → 무시 (skip)
 * boolean   → false
 * int/long  → 0
 * Optional  → Optional.empty()
 * Collection/Map → 빈 컬렉션
 *
 * <p>"쓰지 못하는" 경우는 둘이다. Redis 에 호출을 보냈다가 실패했거나, 서킷브레이커가 열려
 * 있어 호출을 보내지도 못하고 거절당했거나. 판단은 {@link ResilientRedisExecutor}가 한다.</p>
 *
 * <p>복잡한 fallback(DB 조회 등)이 필요한 메서드에는 사용하지 않는다. 그런 메서드는
 * {@link ResilientRedisExecutor}를 직접 주입받아 폴백 값을 넘긴다.</p>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ResilientRedis {
}
