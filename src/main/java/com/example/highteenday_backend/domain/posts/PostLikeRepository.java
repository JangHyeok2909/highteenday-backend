package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PostLikeRepository extends JpaRepository<PostLike,Long> {
    @Query("select pl from PostLike pl where pl.post = :post and pl.user = :user")
    public Optional<PostLike> findByPostAndUser(Post post, User user);
}
