package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;


@Repository
public interface CommentLikeRepository extends JpaRepository<CommentLike, Long> {

    @Query("select cl from CommentLike cl where cl.comment = :comment and cl.user = :user")
    public Optional<CommentLike> findByCommentAndUser(Comment comment, User user);
}
