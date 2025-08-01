package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CommentRepository extends JpaRepository<Comment,Long> {
    @Query("select c from Comment c where c.isValid=true and c.post=:post")
    public List<Comment> findByPost(Post post);
    @Query("select c from Comment c where c.isValid = true and c.user =:user ")
    public Page<Comment> findByUser(User user, Pageable pageable);
}
