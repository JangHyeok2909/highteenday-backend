package com.example.highteenday_backend.domain.reactions;

/** 사용자 한 명이 대상 하나에 남긴 유효한 반응. JPQL 생성자 표현식의 결과 타입이다. */
public record MyReaction(Long targetId, ReactionKind kind) {
}
