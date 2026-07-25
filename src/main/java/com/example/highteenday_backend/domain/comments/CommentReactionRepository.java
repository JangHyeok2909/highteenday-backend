package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.posts.PostReactionKind;
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

    boolean existsByCommentAndUserAndKindAndIsValidTrue(Comment comment, User user, PostReactionKind kind);

    int countByCommentAndKindAndIsValidTrue(Comment comment, PostReactionKind kind);

    // 댓글 목록 조회 시 댓글마다 반응을 개별 조회하면 N+1이 발생하므로 한 번에 가져온다.
    @Query("""
            select r from CommentReaction r
            where r.isValid = true and r.user = :user and r.comment.id in :commentIds
            """)
    List<CommentReaction> findActiveByUserAndCommentIds(@Param("user") User user,
                                                        @Param("commentIds") Collection<Long> commentIds);
}
