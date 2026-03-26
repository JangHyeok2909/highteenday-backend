package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostDislike;
import com.example.highteenday_backend.domain.posts.PostDislikeRepository;
import com.example.highteenday_backend.domain.users.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Slf4j
@RequiredArgsConstructor
@Service
public class PostDislikeService {
    private final HotPostService hotPostService;
    private final PostDislikeRepository postDislikeRepository;

    @Transactional
    public boolean isDislikedByUser(Post post, User user) {
        Optional<PostDislike> postDislike = postDislikeRepository.findByPostAndUser(post, user, true);
        if (postDislike.isEmpty()) {
            return false;
        }
        return true;
    }

    public PostDislike createDislike(Post post, User user) {
        Optional<PostDislike> optional = postDislikeRepository.findByPostAndUser(post, user, null);
        if (optional.isPresent()) {
            PostDislike postDislike = optional.get();
            postDislike.activeDislike();
            syncDislikeCount(post);
            return postDislike;
        }
        PostDislike newPostDislike = PostDislike.builder()
                .post(post)
                .user(user)
                .build();
        PostDislike save = postDislikeRepository.save(newPostDislike);
        hotPostService.updateDailyScore(post.getId());
        syncDislikeCount(post);
        return save;
    }

    @Transactional
    public void cancelDislike(Post post, User user) {
        postDislikeRepository.findByPostAndUser(post, user, null)
                .ifPresent(PostDislike::cancelDislike);
        syncDislikeCount(post);
    }

    private void syncDislikeCount(Post post) {
        post.updateDislike(postDislikeRepository.countByPostAndIsValidTrue(post));
    }
}
