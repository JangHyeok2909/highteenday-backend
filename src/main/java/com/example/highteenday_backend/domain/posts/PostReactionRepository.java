package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PostReactionRepository extends JpaRepository<PostReaction, Long> {

    Optional<PostReaction> findByPostAndUser(Post post, User user);

    boolean existsByPostAndUserAndKindAndIsValidTrue(Post post, User user, PostReactionKind kind);

    int countByPostAndKindAndIsValidTrue(Post post, PostReactionKind kind);
}
