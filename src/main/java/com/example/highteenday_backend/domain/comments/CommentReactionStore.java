package com.example.highteenday_backend.domain.comments;

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
public class CommentReactionStore implements ReactionStore {

    private final CommentRepository commentRepository;
    private final CommentReactionRepository commentReactionRepository;

    @Override
    public ReactionTarget target() {
        return ReactionTarget.COMMENT;
    }

    @Override
    public void requireExists(Long commentId) {
        load(commentId);
    }

    @Override
    public void upsert(Long commentId, Long userId, ReactionKind kind) {
        commentReactionRepository.upsertKind(userId, commentId, kind.name());
    }

    @Override
    public void cancel(Long commentId, Long userId) {
        commentReactionRepository.cancel(userId, commentId);
    }

    @Override
    public ReactionCounts recount(Long commentId) {
        Comment comment = load(commentId);
        int likes = commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, ReactionKind.LIKE);
        int dislikes = commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, ReactionKind.DISLIKE);
        comment.syncReactionCounts(likes, dislikes);
        return new ReactionCounts(likes, dislikes);
    }

    @Override
    public Map<Long, ReactionKind> findMine(Collection<Long> commentIds, Long userId) {
        return commentReactionRepository.findMine(userId, commentIds).stream()
                .collect(Collectors.toMap(MyReaction::targetId, MyReaction::kind));
    }

    // CommentRepository.findById 는 재정의되지 않은 em.find 라 같은 트랜잭션의 두 번째 호출은
    // 1차 캐시에서 끝난다.
    private Comment load(Long commentId) {
        return commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("does not exists Comment, commentId=" + commentId));
    }
}
