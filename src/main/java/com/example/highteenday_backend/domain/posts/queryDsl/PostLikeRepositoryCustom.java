package com.example.highteenday_backend.domain.posts.queryDsl;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostLike;
import com.example.highteenday_backend.domain.posts.PostLikeRepository;
import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface PostLikeRepositoryCustom  {

    public Optional<PostLike> findByPostAndUser(Post post, User user, Boolean isValid);
}
