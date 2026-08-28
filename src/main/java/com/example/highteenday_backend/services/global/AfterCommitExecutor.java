package com.example.highteenday_backend.services.global;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 트랜잭션이 커밋된 뒤에 실행할 작업을 예약한다.
 *
 * <p>왜 필요한가: 캐시 갱신·메시지 발행처럼 <b>롤백해도 되돌릴 수 없는 부수 효과</b>를
 * 트랜잭션 안에서 실행하면, 이후 롤백 시 DB 에 없는 것이 캐시·클라이언트에는 남는다.
 * 게시글 생성 캐시(docs/KNOWN-ISSUES.md KI-22)와 STOMP 발행(KI-24)이 같은 모양의
 * 문제였다.
 *
 * <p>트랜잭션이 없으면 즉시 실행한다. 트랜잭션 밖에서 불렸다는 것은 되돌릴 커밋 자체가
 * 없다는 뜻이라, 미루면 영영 실행되지 않는다.
 *
 * <p><b>주의.</b> {@code afterCommit} 콜백에서 던진 예외는 호출자에게 전파되지 않는다 —
 * 이미 커밋된 트랜잭션을 되돌릴 수 없기 때문이다. 그래서 여기서 잡아 로그만 남긴다.
 * 이 자리에 넣는 작업은 "실패해도 본 요청은 성공으로 봐도 되는 것"이어야 한다.
 * 캐시 갱신은 실패해도 다음 조회가 DB 에서 다시 채우므로 이 조건을 만족한다.
 */
@Slf4j
@Component
public class AfterCommitExecutor {

    public void run(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    action.run();
                } catch (RuntimeException e) {
                    log.warn("afterCommit action failed. The transaction is already committed.", e);
                }
            }
        });
    }
}
