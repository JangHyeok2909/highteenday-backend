package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.posts.PostReactionRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.eventEntities.events.PostReactedEvent;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;


@RequiredArgsConstructor
@Service
public class PostReactionService {

    private final PostReactionRepository postReactionRepository;
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
                .dislikeCount(post.getDislikeCount())
                .build();
    }

    private void cancelState(Post post, User user) {
        postReactionRepository.findByPostAndUser(post, user)
                .ifPresent(r -> r.cancel());
        syncCounts(post);
        eventPublisher.publishEvent(new PostReactedEvent(post.getId()));
    }

    private void createReaction(Post post, User user, PostReactionKind kind) {
        // 조회 후 없으면 insert 하던 구조를 upsert 한 문장으로 바꿨다. 그 사이에 다른 요청이
        // 같은 (게시글, 사용자) 행을 만들면 UNIQUE 제약에 걸려 409 로 나갔는데, 반응은 토글이라
        // 사용자 입장에서는 실패할 이유가 없는 요청이었다.
        postReactionRepository.upsertKind(user.getId(), post.getId(), kind.name());
        syncCounts(post);
        eventPublisher.publishEvent(new PostReactedEvent(post.getId()));
    }

    private void syncCounts(Post post) {
        int likes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.LIKE);
        int dislikes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.DISLIKE);
        post.syncReactionCounts(likes, dislikes);
    }
}
