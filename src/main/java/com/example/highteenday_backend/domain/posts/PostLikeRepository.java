package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.posts.queryDsl.PostLikeRepositoryCustom;
import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PostLikeRepository extends JpaRepository<PostLike,Long>, PostLikeRepositoryCustom {
    int countByPostAndIsValidTrue(Post post);

}
