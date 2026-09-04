package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PostReactionRepository extends JpaRepository<PostReaction, Long> {

    Optional<PostReaction> findByPostAndUser(Post post, User user);

    boolean existsByPostAndUserAndKindAndIsValidTrue(Post post, User user, ReactionKind kind);

    int countByPostAndKindAndIsValidTrue(Post post, ReactionKind kind);

    /**
     * 반응을 지정한 종류로 설정한다 — 없으면 만들고, 있으면 종류를 바꾸며 되살린다.
     *
     * 기존 createReaction 은 조회해서 없으면 save 하는 체크-후-실행이었고, 보호 장치가 없었다.
     * UNIQUE(PST_id, USR_id) 가 걸려 있어 같은 사용자의 동시 반응은 그대로 409 로 나갔다
     * (large 시드 실측: Duplicate entry '20-49' for key 'posts_reactions.uk_posts_reactions_pst_usr').
     *
     * upsert 는 조회와 삽입 사이의 틈을 없앤다. 스크랩 쪽과 같은 방식이며, 예외를 잡아
     * 복구하는 방식은 쓰지 않는다 — 제약 위반이 flush 를 깨뜨린 뒤에는 같은 영속성 컨텍스트로
     * 아무것도 이어서 할 수 없기 때문이다.
     *
     * 반환값은 affected rows — 1이면 새로 만든 것, 2면 기존 행을 갱신한 것이다.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO posts_reactions (USR_id, PST_id, created_at, is_valid, PST_RCT_kind)
            VALUES (:userId, :postId, NOW(6), TRUE, :kind)
            ON DUPLICATE KEY UPDATE PST_RCT_kind = :kind, is_valid = TRUE, UPT_Date = NOW(6)
            """, nativeQuery = true)
    int upsertKind(@Param("userId") Long userId, @Param("postId") Long postId, @Param("kind") String kind);
}
