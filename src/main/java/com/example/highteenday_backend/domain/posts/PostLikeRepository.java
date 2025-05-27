package com.example.highteenday_backend.domain.posts;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PostLikeRepository extends JpaRepository<PostLike,Long> {
//    public List<PostLike> findByPost(Post post);
    public Optional<PostLike> findById(Long postLikeId);

    @Query("select pl from PostLike pl where pl.post = :post and pl.isLiked = true")
    public List<PostLike> findRecentLikes(Post post);

    @Query("select pl from PostLike pl where pl.id = :postId")
    public List<PostLike> findByPostId(Long postId);
}
