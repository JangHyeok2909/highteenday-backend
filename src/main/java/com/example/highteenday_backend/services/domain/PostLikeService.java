package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.posts.PostLike;
import com.example.highteenday_backend.domain.posts.PostLikeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;


@Slf4j
@RequiredArgsConstructor
@Service
public class PostLikeService {
    private final PostLikeRepository postLikeRepository;
    public PostLike findById(Long postLikeId){
        return postLikeRepository.findById(postLikeId)
                     .orElseThrow(()->new RuntimeException("postLike does not exists, postLikeId="+postLikeId));
    }
    public List<PostLike> findByPostId(Long postId){
        return postLikeRepository.findByPostId(postId);
    }

    //log
    @Transactional
    public PostLike createPostLike(PostLike postLike){
        return postLikeRepository.save(postLike);
    }

    @Transactional
    public void updateLikeFlag(PostLike postLike){
        postLike.updateLikeFlag();
        log.info("postLike flag update, postLikeId={}, changedFlag = {}",postLike.getId(),postLike.getIsLiked());
    }
}
