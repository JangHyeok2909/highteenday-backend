package com.example.highteenday_backend.domain.scraps;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ScrapRepository extends JpaRepository<Scrap, Long> {
    @Query("select s from Scrap s where s.post = :post and s.user = :user")
    Optional<Scrap> findByPostAndUser(Post post, User user);

    @Query("select s from Scrap s where s.user = :user and s.isValid = true")
    List<Scrap> findByUser(User user);

    @Query("select count(s) from Scrap s where s.post = :post and s.isValid = true")
    long countValidByPost(@Param("post") Post post);

    /**
     * 스크랩을 켠다 — 없으면 만들고, 있으면 다시 유효하게 바꾼다. 한 문장이라 경쟁이 없다.
     *
     * 이전에는 조회해서 없으면 save 하는 체크-후-실행이었다. UNIQUE(USR_id, PST_id)를 건 뒤로는
     * 동시 요청 중 하나가 제약에 걸렸는데, 그 예외를 잡아 같은 트랜잭션에서 복구하려던 시도는
     * JPA 에서 성립하지 않는다. flush 가 실패해도 id 가 null 인 엔티티는 영속성 컨텍스트에 남고,
     * 이어지는 조회가 자동 flush 를 부르면서 "null id in ... entry (don't flush the Session after
     * an exception occurs)" 로 다시 죽는다. 설령 그걸 피해도 트랜잭션은 이미 rollback-only 다.
     *
     * upsert 는 그 경로 자체를 없앤다. 동시 요청 둘이 들어와도 하나는 INSERT, 하나는 UPDATE 로
     * 끝나고 최종 상태는 같다.
     *
     * 반환값은 MySQL 의 affected rows 다 — 1이면 새로 만들었고, 2면 기존 행을 갱신했다.
     * 호출부가 이 값으로 "새 스크랩인가"를 판단해 이벤트 중복 발행을 막는다.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO scraps (USR_id, PST_id, created_at, is_valid)
            VALUES (:userId, :postId, NOW(6), TRUE)
            ON DUPLICATE KEY UPDATE is_valid = TRUE, UPT_Date = NOW(6)
            """, nativeQuery = true)
    int upsertActive(@Param("userId") Long userId, @Param("postId") Long postId);
}
