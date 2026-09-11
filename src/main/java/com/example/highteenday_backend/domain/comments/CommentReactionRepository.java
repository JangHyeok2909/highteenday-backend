package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.posts.ReactionKind;
import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface CommentReactionRepository extends JpaRepository<CommentReaction, Long> {

    Optional<CommentReaction> findByCommentAndUser(Comment comment, User user);

    boolean existsByCommentAndUserAndKindAndIsValidTrue(Comment comment, User user, ReactionKind kind);

    int countByCommentAndKindAndIsValidTrue(Comment comment, ReactionKind kind);

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
            select r from CommentReaction r
            where r.user = :user
              and r.isValid = true
              and r.comment.id in :commentIds
            """)
    List<CommentReaction> findMineByCommentIds(@Param("user") User user,
                                               @Param("commentIds") Collection<Long> commentIds);
}
