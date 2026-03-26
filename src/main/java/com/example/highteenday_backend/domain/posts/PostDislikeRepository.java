package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.posts.queryDsl.PostDislikeRepositoryCustom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PostDislikeRepository extends JpaRepository<PostDislike, Long>, PostDislikeRepositoryCustom {

    int countByPostAndIsValidTrue(Post post);
}
