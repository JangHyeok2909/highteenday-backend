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
import org.springframework.transaction.annotation.Transactional;

import java.util.NoSuchElementException;
import java.util.Optional;


@Slf4j
@RequiredArgsConstructor
@Service
public class PostLikeService {
    private final HotPostService hotPostService;
    private final PostLikeRepository postLikeRepository;

    @Transactional
    public boolean isLikedByUser(Post post, User user){
        Optional<PostLike> postLike = postLikeRepository.findByPostAndUser(post, user,true);
        if(postLike.isEmpty()) return false;
        return true;
    }
    public PostLike createLike(Post post, User user){
        Optional<PostLike> optional = postLikeRepository.findByPostAndUser(post, user,null);
        //이미 좋아요 했던 경우
        if(optional.isPresent()){
            PostLike postLike = optional.get();
            postLike.activeLike();
            //db sync
            syncLikeCount(post);
            return postLike;
        } else { //처음하는 경우
            PostLike newPostLike = PostLike.builder()
                    .post(post)
                    .user(user)
                    .build();
            PostLike save = postLikeRepository.save(newPostLike);
            //핫스코어 갱신
            hotPostService.updateDailyScore(post.getId());
            //db sync
            syncLikeCount(post);
            return save;
        }

    }

    @Transactional
    public void cancelLike(Post post, User user){
        postLikeRepository.findByPostAndUser(post, user,null)
                .ifPresent(PostLike::cancelLike);
        //db sync
        syncLikeCount(post);

    }
    private void syncLikeCount(Post post){
        post.updateLikeCount(postLikeRepository.countByPostAndIsValidTrue(post));
    }
}
