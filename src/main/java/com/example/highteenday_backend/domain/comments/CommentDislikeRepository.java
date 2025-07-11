package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface CommentDislikeRepository extends JpaRepository<CommentDislike, Long> {
    @Query("select cd from CommentDislike cd where cd.comment = :comment and cd.user = :user")
    public Optional<CommentDislike> findByCommentAndUser(Comment comment, User user);
}
