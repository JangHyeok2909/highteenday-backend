package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentLike;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostLike;
import com.example.highteenday_backend.domain.posts.PostLikeRepository;
import com.example.highteenday_backend.domain.users.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Optional;


@Slf4j
@RequiredArgsConstructor
@Service
public class PostLikeService {
    private final PostLikeRepository postLikeRepository;


    public boolean isLikedByUser(Post post, User user){
        Optional<PostLike> postLike = postLikeRepository.findByPostAndUser(post, user);
        if(postLike.isEmpty()) return false;
        return true;
    }
    public PostLike createLike(Post post, User user){
        Optional<PostLike> postLike = postLikeRepository.findByPostAndUser(post, user);
        if(postLike.isEmpty()){
            PostLike newPostLike = PostLike.builder().post(post).user(user).build();
            return postLikeRepository.save(newPostLike);
        } else {
            return postLike.get();
        }
    }

    public void cancelLike(Post post, User user){
        Optional<PostLike> postLike = postLikeRepository.findByPostAndUser(post, user);
        if(postLike.isEmpty()) return;
        postLikeRepository.delete(postLike.get());
    }
}
