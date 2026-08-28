package com.example.highteenday_backend.domain.port;

import java.time.Duration;
import java.util.Map;

public interface ViewCountStorePort {

    boolean tryMarkViewed(Long postId, Long userId, Duration ttl);

    void incrementCount(Long postId);

    int getCount(Long postId);

    /**
     * DB 반영 대기 중인 증가분을 <b>읽기만</b> 한다. 지우지 않는다.
     *
     * <p>예전에는 읽으면서 동시에 지웠고(GETDEL), 그 뒤 DB 반영이 실패하면 이미 사라진
     * 증가분이 복구되지 않았다 — 배치 트랜잭션 전체가 실패하면 그 주기 증가분이 통째로
     * 날아갔다 (docs/KNOWN-ISSUES.md KI-23). 읽기와 정리를 나눠, 정리는 DB 반영이
     * 성공한 뒤 {@link #settleCounts(Map)} 로 한다.
     */
    Map<Long, Integer> peekPendingCounts();

    /**
     * DB 에 반영된 만큼만 카운터에서 뺀다.
     *
     * <p>삭제가 아니라 <b>차감</b>인 이유: 읽은 뒤 반영까지 사이에 들어온 새 조회수가
     * 카운터에 이미 더해져 있다. 키를 통째로 지우면 그 조회수까지 사라진다.
     * 반영한 값만 빼면 그 사이 증가분은 다음 주기로 넘어간다.
     */
    void settleCounts(Map<Long, Integer> applied);
}
