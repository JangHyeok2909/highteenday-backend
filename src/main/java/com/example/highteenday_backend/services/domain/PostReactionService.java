package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReaction;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.posts.PostReactionRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

@RequiredArgsConstructor
@Service
public class PostReactionService {

    private final PostReactionRepository postReactionRepository;
    private final HotPostService hotPostService;

    public boolean isLikedByUser(Post post, User user) {
        return postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE);
    }

    public boolean isDislikedByUser(Post post, User user) {
        return postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE);
    }

    @Transactional
    public void likeReact(Post post, User user) {
        boolean liked = isLikedByUser(post, user);
        boolean disliked = isDislikedByUser(post, user);
        if (liked && !disliked) {
            cancelLikeInternal(post, user);
        } else if (!liked && disliked) {
            cancelDislikeInternal(post, user);
            createLikeInternal(post, user);
        } else {
            createLikeInternal(post, user);
        }
    }

    @Transactional
    public void dislikeReact(Post post, User user) {
        boolean liked = isLikedByUser(post, user);
        boolean disliked = isDislikedByUser(post, user);
        if (liked && !disliked) {
            cancelLikeInternal(post, user);
            createDislikeInternal(post, user);
        } else if (!liked && disliked) {
            cancelDislikeInternal(post, user);
        } else {
            createDislikeInternal(post, user);
        }
    }

    public LikeStateDto getLikeSatateDto(Post post, User user) {
        boolean isLiked = isLikedByUser(post, user);
        boolean isDisliked = isDislikedByUser(post, user);
        return LikeStateDto.builder()
                .postId(post.getId())
                .isLiked(isLiked)
                .isDisliked(isDisliked)
                .likeCount(post.getLikeCount())
                .build();
    }

    private void cancelLikeInternal(Post post, User user) {
        postReactionRepository.findByPostAndUser(post, user)
                .ifPresent(r -> {
                    if (r.getKind() == PostReactionKind.LIKE && Boolean.TRUE.equals(r.getIsValid())) {
                        r.cancel();
                    }
                });
        syncCounts(post);
    }

    private void cancelDislikeInternal(Post post, User user) {
        postReactionRepository.findByPostAndUser(post, user)
                .ifPresent(r -> {
                    if (r.getKind() == PostReactionKind.DISLIKE && Boolean.TRUE.equals(r.getIsValid())) {
                        r.cancel();
                    }
                });
        syncCounts(post);
    }

    private void createLikeInternal(Post post, User user) {
        Optional<PostReaction> opt = postReactionRepository.findByPostAndUser(post, user);
        if (opt.isEmpty()) {
            postReactionRepository.save(PostReaction.builder()
                    .post(post)
                    .user(user)
                    .kind(PostReactionKind.LIKE)
                    .build());
            hotPostService.updateDailyScore(post.getId());
            syncCounts(post);
            return;
        }
        PostReaction r = opt.get();
        if (!Boolean.TRUE.equals(r.getIsValid())) {
            r.applyActive(PostReactionKind.LIKE);
            hotPostService.updateDailyScore(post.getId());
            syncCounts(post);
            return;
        }
        if (r.getKind() == PostReactionKind.DISLIKE) {
            r.applyActive(PostReactionKind.LIKE);
            hotPostService.updateDailyScore(post.getId());
            syncCounts(post);
        }
    }

    private void createDislikeInternal(Post post, User user) {
        Optional<PostReaction> opt = postReactionRepository.findByPostAndUser(post, user);
        if (opt.isEmpty()) {
            postReactionRepository.save(PostReaction.builder()
                    .post(post)
                    .user(user)
                    .kind(PostReactionKind.DISLIKE)
                    .build());
            hotPostService.updateDailyScore(post.getId());
            syncCounts(post);
            return;
        }
        PostReaction r = opt.get();
        if (!Boolean.TRUE.equals(r.getIsValid())) {
            r.applyActive(PostReactionKind.DISLIKE);
            hotPostService.updateDailyScore(post.getId());
            syncCounts(post);
            return;
        }
        if (r.getKind() == PostReactionKind.LIKE) {
            r.applyActive(PostReactionKind.DISLIKE);
            hotPostService.updateDailyScore(post.getId());
            syncCounts(post);
        }
    }

    private void syncCounts(Post post) {
        post.updateLikeCount(postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.LIKE));
        post.updateDislike(postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.DISLIKE));
    }
}
