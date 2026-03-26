package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CommentReactionRepository extends JpaRepository<CommentReaction, Long> {

    Optional<CommentReaction> findByCommentAndUser(Comment comment, User user);

    boolean existsByCommentAndUserAndKindAndIsValidTrue(Comment comment, User user, PostReactionKind kind);

    int countByCommentAndKindAndIsValidTrue(Comment comment, PostReactionKind kind);
}
