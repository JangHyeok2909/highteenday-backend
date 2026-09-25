package com.example.highteenday_backend.domain.reactions;

import java.util.Collection;
import java.util.Map;

/**
 * 반응 대상(게시글, 댓글)마다 다른 저장소 연산을 감싼다.
 *
 * <p>쓰기 연산은 목표 상태로 맞추는 연산이다. 같은 인자로 여러 번 불러도 한 번 부른 것과
 * 결과가 같아야 하므로, 구현은 현재 상태를 읽고 분기하지 않는다.
 */
public interface ReactionStore {

    /** 현 엔티티 종류 반환*/
    ReactionTarget target();

    /** 대상이 없으면 ResourceNotFoundException(404)을 던진다. */
    void requireExists(Long targetId);

    /** 반응 행을 kind·유효 상태로 만든다. 행이 없으면 새로 만든다. */
    void upsert(Long targetId, Long userId, ReactionKind kind);

    /** 유효한 반응을 끈다. 행이 없거나 이미 꺼져 있으면 아무것도 바꾸지 않는다. */
    void cancel(Long targetId, Long userId);

    /** 유효 반응 행을 다시 세어 대상의 비정규화 카운터에 쓰고, 센 값을 돌려준다. */
    ReactionCounts recount(Long targetId);

    /** 반응이 없는 대상은 결과 맵에 없다. */
    Map<Long, ReactionKind> findMine(Collection<Long> targetIds, Long userId);
}
