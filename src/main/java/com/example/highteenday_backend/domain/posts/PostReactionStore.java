package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.reactions.MyReaction;
import com.example.highteenday_backend.domain.reactions.ReactionCounts;
import com.example.highteenday_backend.domain.reactions.ReactionKind;
import com.example.highteenday_backend.domain.reactions.ReactionStore;
import com.example.highteenday_backend.domain.reactions.ReactionTarget;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class PostReactionStore implements ReactionStore {

    private final PostRepository postRepository;
    private final PostReactionRepository postReactionRepository;

    @Override
    public ReactionTarget target() {
        return ReactionTarget.POST;
    }

    @Override
    public void requireExists(Long postId) {
        postRepository.findById(postId)
                .orElseThrow(() -> new ResourceNotFoundException("post does not exist, postId=" + postId));
    }

    @Override
    public void upsert(Long postId, Long userId, ReactionKind kind) {
        postReactionRepository.upsertKind(userId, postId, kind.name());
    }

    @Override
    public void cancel(Long postId, Long userId) {
        postReactionRepository.cancel(userId, postId);
    }

    @Override
    public ReactionCounts recount(Long postId) {
        // requireExists 가 같은 트랜잭션에서 읽어 둔 엔티티를 1차 캐시에서 받는다.
        // findById 는 @Query(JPQL)라 다시 부르면 SELECT 가 한 번 더 나간다.
        Post post = postRepository.getReferenceById(postId);
        int likes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, ReactionKind.LIKE);
        int dislikes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, ReactionKind.DISLIKE);
        post.syncReactionCounts(likes, dislikes);
        return new ReactionCounts(likes, dislikes);
    }

    @Override
    public Map<Long, ReactionKind> findMine(Collection<Long> postIds, Long userId) {
        return postReactionRepository.findMine(userId, postIds).stream()
                .collect(Collectors.toMap(MyReaction::targetId, MyReaction::kind));
    }
}
