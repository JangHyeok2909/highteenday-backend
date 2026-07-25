package com.example.highteenday_backend.domain;

import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.PostRepository;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Lock;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 반응 카운터 재집계를 감싸는 잠금 조회가 실제로 쓰기 잠금인지 검증한다.
 * 잠금 모드가 약해지면(예: PESSIMISTIC_READ) 갱신 손실이 다시 발생하므로 어노테이션 자체를 고정한다.
 */
class ReactionCountLockingTest {

    @Test
    @DisplayName("PostRepository.findByIdForUpdate는 PESSIMISTIC_WRITE 잠금을 사용한다")
    void postLockQueryUsesPessimisticWrite() throws NoSuchMethodException {
        assertLockMode(PostRepository.class.getMethod("findByIdForUpdate", Long.class));
    }

    @Test
    @DisplayName("CommentRepository.findByIdForUpdate는 PESSIMISTIC_WRITE 잠금을 사용한다")
    void commentLockQueryUsesPessimisticWrite() throws NoSuchMethodException {
        assertLockMode(CommentRepository.class.getMethod("findByIdForUpdate", Long.class));
    }

    private void assertLockMode(Method method) {
        Lock lock = method.getAnnotation(Lock.class);

        assertThat(lock)
                .as("%s 에 @Lock 이 없으면 재집계가 잠금 없이 실행된다", method.getName())
                .isNotNull();
        assertThat(lock.value()).isEqualTo(LockModeType.PESSIMISTIC_WRITE);
    }
}
