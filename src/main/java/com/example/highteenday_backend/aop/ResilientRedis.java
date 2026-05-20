package com.example.highteenday_backend.aop;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Redis 장애 시 예외를 삼키고 반환 타입에 맞는 기본값을 반환한다.
 * void      → 무시 (skip)
 * boolean   → false
 * int/long  → 0
 * Collection/Map → 빈 컬렉션
 *
 * 복잡한 fallback(DB 조회 등)이 필요한 메서드에는 사용하지 않는다.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ResilientRedis {
}
