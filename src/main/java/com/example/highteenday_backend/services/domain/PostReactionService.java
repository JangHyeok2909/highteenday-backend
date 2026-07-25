package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReaction;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.posts.PostReactionRepository;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.eventEntities.events.PostReactedEvent;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@RequiredArgsConstructor
@Service
public class PostReactionService {

    private final PostReactionRepository postReactionRepository;
    private final PostRepository postRepository;
    private final ApplicationEventPublisher eventPublisher;

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
        lockPost(post);
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
        lockPost(post);
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

    /**
     * 같은 게시글에 대한 반응 처리를 직렬화한다. 트랜잭션이 커밋될 때까지 잠금이 유지되므로
     * 뒤이은 트랜잭션의 재집계 COUNT는 앞선 트랜잭션이 만든 행을 반드시 포함한다.
     */
    private void lockPost(Post post) {
        postRepository.findByIdForUpdate(post.getId())
                .orElseThrow(() -> new ResourceNotFoundException("post does not exist, postId=" + post.getId()));
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

            syncCounts(post);
            eventPublisher.publishEvent(new PostReactedEvent(post.getId()));
            return;
        }
        PostReaction r = opt.get();
        r.applyState(kind);
        syncCounts(post);
        eventPublisher.publishEvent(new PostReactedEvent(post.getId()));

    }

    private void syncCounts(Post post) {
        int likes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.LIKE);
        int dislikes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.DISLIKE);
        post.syncReactionCounts(likes, dislikes);
    }
}
