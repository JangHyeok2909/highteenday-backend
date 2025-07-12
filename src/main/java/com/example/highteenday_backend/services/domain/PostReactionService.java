package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@RequiredArgsConstructor
@Service
public class PostReactionService {
    private final PostLikeService postLikeService;
    private final PostDislikeService postDislikeService;

    @Transactional
    public void likeReact(Post post, User user){
        boolean liked = postLikeService.isLikedByUser(post, user);
        boolean disliked = postDislikeService.isDislikedByUser(post, user);
        //좋아요 누른상태
        if(liked && !disliked){
            postLikeService.cancelLike(post, user);
            post.minusLikeCount();
        }
        //싫어요 누른상태
        else if (!liked && disliked) {
            postDislikeService.cancelDislike(post, user);
            postLikeService.createLike(post, user);
            post.plusLikeCount();
            post.minusDislikeCount();
        }
        //아무것도 안 누른 상태
        else{
            postLikeService.createLike(post, user);
            post.plusLikeCount();
        }
    }
    @Transactional
    public void dislikeReact(Post post, User user){
        boolean liked = postLikeService.isLikedByUser(post, user);
        boolean disliked = postDislikeService.isDislikedByUser(post, user);
        //좋아요 누른상태
        if(liked && !disliked){
            postLikeService.cancelLike(post, user);
            postDislikeService.createDislike(post, user);
            post.minusLikeCount();
            post.plusDislikeCount();
        }
        //싫어요 누른상태
        else if (!liked && disliked) {
            postDislikeService.cancelDislike(post, user);
            post.minusDislikeCount();
        }
        //아무것도 안 누른 상태
        else{
            postDislikeService.createDislike(post, user);
            post.plusDislikeCount();
        }
    }
}
