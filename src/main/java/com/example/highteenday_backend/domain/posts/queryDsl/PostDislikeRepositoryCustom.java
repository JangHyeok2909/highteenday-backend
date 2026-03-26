package com.example.highteenday_backend.domain.posts.queryDsl;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostDislike;
import com.example.highteenday_backend.domain.users.User;

import java.util.Optional;

public interface PostDislikeRepositoryCustom {

    Optional<PostDislike> findByPostAndUser(Post post, User user, Boolean isValid);
}
