package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PostDislikeRepository extends JpaRepository<PostDislike,Long> {

    @Query("select pdl from PostDislike pdl where pdl.post = :post and pdl.user = :user")
    public Optional<PostDislike> findByPostAndUser(Post post, User user);
}
