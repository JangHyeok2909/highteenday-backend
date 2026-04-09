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

    /*
    * valid의 상태가 false의 경우, reactionKind 무의미
    *
    * */
    @Transactional
    public void likeReact(Post post, User user) {
        boolean liked = isLikedByUser(post, user);
        boolean disliked = isDislikedByUser(post, user);
        if (liked && !disliked) {   //좋아요 상태 -> valid = false 전환
            cancelState(post, user);
        } else { //싫어요 상태 or 상태없음 -> 좋아요 전환(생성)
            createReaction(post, user, PostReactionKind.LIKE);
        }
    }

    @Transactional
    public void dislikeReact(Post post, User user) {
        boolean liked = isLikedByUser(post, user);
        boolean disliked = isDislikedByUser(post, user);
        if (!liked && disliked) { //싫어요 상태 -> valid = false 전환
            cancelState(post, user);
        } else { //좋아요 상태 or 상태없음 -> 싫어요 전환(생성)
            createReaction(post, user,PostReactionKind.DISLIKE);
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

    private void cancelState(Post post, User user) {
        postReactionRepository.findByPostAndUser(post, user)
                .ifPresent(r -> r.cancel());
        syncCounts(post);
    }

    private void createReaction(Post post, User user, PostReactionKind kind) {
        Optional<PostReaction> opt = postReactionRepository.findByPostAndUser(post, user);
        if (opt.isEmpty()) { //존재하지 않으면 insert
            postReactionRepository.save(PostReaction.builder()
                    .post(post)
                    .user(user)
                    .kind(kind)
                    .build());

            //좋아요 생성시 핫스코어 업데이트
            hotPostService.updateLeaderboardDayScore(post.getId());
            syncCounts(post);
            return;
        }
        //존재할경우 like 적용 후 핫스코어 업데이트
        PostReaction r = opt.get();
        r.applyState(kind);
        hotPostService.updateLeaderboardDayScore(post.getId());
        syncCounts(post);

    }

    private void syncCounts(Post post) {
        post.updateLikeCount(postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.LIKE));
        post.updateDislike(postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.DISLIKE));
    }
}
