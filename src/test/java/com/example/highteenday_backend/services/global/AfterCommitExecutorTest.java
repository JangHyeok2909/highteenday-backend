package com.example.highteenday_backend.services.global;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 커밋 이후 실행 장치 (docs/KNOWN-ISSUES.md KI-22, KI-24).
 *
 * 트랜잭션 매니저를 띄우지 않고 {@link TransactionSynchronizationManager} 를 직접
 * 조작한다. 검증 대상이 "동기화가 활성일 때 미루고, 아닐 때 바로 실행하는가"라서
 * 실제 DB 커밋은 필요 없다.
 */
@DisplayName("AfterCommitExecutor")
class AfterCommitExecutorTest {

    private final AfterCommitExecutor executor = new AfterCommitExecutor();

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("트랜잭션 안에서는 커밋 전에 실행되지 않는다")
    void doesNotRunBeforeCommit() {
        TransactionSynchronizationManager.initSynchronization();
        AtomicInteger runs = new AtomicInteger();

        executor.run(runs::incrementAndGet);

        assertThat(runs.get())
                .as("커밋 전에 실행되면 롤백 시 되돌릴 수 없는 부수 효과가 남는다")
                .isZero();
        assertThat(TransactionSynchronizationManager.getSynchronizations()).hasSize(1);
    }

    @Test
    @DisplayName("커밋되면 그때 실행된다")
    void runsOnCommit() {
        TransactionSynchronizationManager.initSynchronization();
        AtomicInteger runs = new AtomicInteger();

        executor.run(runs::incrementAndGet);
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);

        assertThat(runs.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("롤백되면 실행되지 않는다 — afterCommit 이 안 불리기 때문")
    void doesNotRunOnRollback() {
        TransactionSynchronizationManager.initSynchronization();
        AtomicInteger runs = new AtomicInteger();

        executor.run(runs::incrementAndGet);
        // 롤백 경로에서는 afterCompletion 만 불리고 afterCommit 은 불리지 않는다.
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        assertThat(runs.get()).isZero();
    }

    @Test
    @DisplayName("트랜잭션이 없으면 즉시 실행한다 — 미루면 영영 실행되지 않는다")
    void runsImmediatelyWithoutTransaction() {
        AtomicInteger runs = new AtomicInteger();

        executor.run(runs::incrementAndGet);

        assertThat(runs.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("커밋 후 작업이 실패해도 호출자에게 예외가 튀지 않는다")
    void swallowsFailureAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();

        executor.run(() -> {
            throw new IllegalStateException("cache down");
        });

        // 이미 커밋된 트랜잭션은 되돌릴 수 없다. 여기서 예외가 올라가면
        // 성공한 요청이 실패로 보고된다.
        assertThatCode(() -> TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit))
                .doesNotThrowAnyException();
    }
}
