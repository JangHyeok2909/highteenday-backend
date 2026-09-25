package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.reactions.MyReaction;
import com.example.highteenday_backend.domain.reactions.ReactionKind;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface CommentReactionRepository extends JpaRepository<CommentReaction, Long> {

    int countByCommentAndKindAndIsValidTrue(Comment comment, ReactionKind kind);

    /**
     * 반응을 지정한 종류로 설정한다. 없으면 만들고, 있으면 종류를 바꾸며 되살린다.
     *
     * <p>조회한 뒤 저장하면 같은 사용자의 동시 요청이 uk_comments_reactions_cmt_usr 에 걸리므로
     * 한 문장으로 처리한다. {@code PostReactionRepository.upsertKind} 와 같은 방식이다.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            INSERT INTO comments_reactions (USR_id, CMT_id, created_at, is_valid, CMT_RCT_kind)
            VALUES (:userId, :commentId, NOW(6), TRUE, :kind)
            ON DUPLICATE KEY UPDATE CMT_RCT_kind = :kind, is_valid = TRUE, UPT_Date = NOW(6)
            """, nativeQuery = true)
    int upsertKind(@Param("userId") Long userId, @Param("commentId") Long commentId, @Param("kind") String kind);

    /** 유효한 반응을 끈다. 행이 없거나 이미 꺼져 있으면 0행을 바꾸고 끝난다. */
    @Modifying(flushAutomatically = true)
    @Query(value = """
            UPDATE comments_reactions
            SET is_valid = FALSE, UPT_Date = NOW(6)
            WHERE CMT_id = :commentId AND USR_id = :userId AND is_valid = TRUE
            """, nativeQuery = true)
    int cancel(@Param("userId") Long userId, @Param("commentId") Long commentId);

    /**
     * 한 사용자가 주어진 댓글들에 남긴 유효한 반응을 한 번에 가져온다.
     *
     * 댓글 목록 조회는 댓글마다 "내가 좋아요 했나"와 "내가 싫어요 했나"를 따로 물어
     * 요청 하나에 조회를 2N 번 발행했다. 각 조회는 uk_comments_reactions_cmt_usr 를 그대로
     * 타서 1행만 읽는 싼 쿼리지만, 인기 글은 댓글이 500개를 넘어 왕복만 1,000번이 된다.
     * 실측(medium, normal-day Before 5회)에서 이 엔드포인트의 요청당 쿼리 수는 1,507 이었고,
     * 이 확인을 한 번으로 접자 112 로 줄었다. 없앤 1,395 개가 요청당 쿼리의 약 93% 다.
     *
     * (댓글, 사용자)에 유니크 제약이 있으므로 댓글 하나당 최대 한 행이 돌아온다.
     *
     * 게시글로 거르지 않고 댓글 id 목록을 받는 이유: 화면에 실제로 그려지는 댓글과 조회
     * 대상을 같게 묶기 위해서다. 게시글 기준으로 거르면 목록 쿼리에 페이징이나 필터가
     * 붙는 순간 조회 결과가 조용히 목록보다 넓어진다.
     */
    @Query("""
            select new com.example.highteenday_backend.domain.reactions.MyReaction(r.comment.id, r.kind)
            from CommentReaction r
            where r.user.id = :userId
              and r.isValid = true
              and r.comment.id in :commentIds
            """)
    List<MyReaction> findMine(@Param("userId") Long userId, @Param("commentIds") Collection<Long> commentIds);
}
