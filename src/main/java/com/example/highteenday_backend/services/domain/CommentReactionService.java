package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentReaction;
import com.example.highteenday_backend.domain.comments.CommentReactionRepository;
import com.example.highteenday_backend.domain.posts.ReactionKind;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RequiredArgsConstructor
@Service
public class CommentReactionService {

    private final CommentReactionRepository commentReactionRepository;

    public boolean isLikedByUser(Comment comment, User user) {
        return commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.LIKE);
    }

    public boolean isDislikedByUser(Comment comment, User user) {
        return commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.DISLIKE);
    }

    @Transactional
    public void likeReact(Comment comment, User user) {
        boolean liked = isLikedByUser(comment, user);
        boolean disliked = isDislikedByUser(comment, user);
        if (liked && !disliked) {
            cancelLikeInternal(comment, user);
        } else if (!liked && disliked) {
            cancelDislikeInternal(comment, user);
            createLikeInternal(comment, user);
        } else {
            createLikeInternal(comment, user);
        }
    }

    @Transactional
    public void dislikeReact(Comment comment, User user) {
        boolean liked = isLikedByUser(comment, user);
        boolean disliked = isDislikedByUser(comment, user);
        if (liked && !disliked) {
            cancelLikeInternal(comment, user);
            createDislikeInternal(comment, user);
        } else if (!liked && disliked) {
            cancelDislikeInternal(comment, user);
        } else {
            createDislikeInternal(comment, user);
        }
    }

    /**
     * 여러 댓글에 대한 "내 반응"을 한 번의 조회로 가져온다.
     *
     * 댓글 목록 화면은 댓글마다 좋아요·싫어요 여부만 필요하고, 개수는 이미 Comment 에
     * 비정규화돼 있다. 그런데 댓글마다 {@link #getLikeStateDto}를 부르면 확인 쿼리가
     * 2N 번 나간다. 여기서는 댓글 id 전체를 한 번에 넘겨 조회를 1회로 줄인다.
     *
     * 반응이 없는 댓글은 결과 맵에 아예 없다 — 그쪽이 "반응 없음"을 표현하는 별도 값을
     * 두는 것보다 호출부에서 읽기 쉽다(kind == LIKE 비교가 null 에서도 그대로 false 다).
     *
     * @return 댓글 id → 그 댓글에 이 사용자가 남긴 유효한 반응의 종류
     */
    public Map<Long, ReactionKind> findMyReactions(List<Comment> comments, User user) {
        if (comments.isEmpty()) return Map.of();
        List<Long> commentIds = comments.stream().map(Comment::getId).toList();
        return commentReactionRepository.findMineByCommentIds(user, commentIds).stream()
                .collect(Collectors.toMap(r -> r.getComment().getId(), CommentReaction::getKind));
    }

    public LikeStateDto getLikeStateDto(Comment comment, User user) {
        boolean isLiked = isLikedByUser(comment, user);
        boolean isDisliked = isDislikedByUser(comment, user);
        return LikeStateDto.builder()
                .commentId(comment.getId())
                .isLiked(isLiked)
                .isDisliked(isDisliked)
                .likeCount(comment.getLikeCount())
                .dislikeCount(comment.getDislikeCount())
                .build();
    }

    private void cancelLikeInternal(Comment comment, User user) {
        commentReactionRepository.findByCommentAndUser(comment, user)
                .ifPresent(r -> {
                    if (r.getKind() == ReactionKind.LIKE && Boolean.TRUE.equals(r.getIsValid())) {
                        r.cancel();
                    }
                });
        syncCounts(comment);
    }

    private void cancelDislikeInternal(Comment comment, User user) {
        commentReactionRepository.findByCommentAndUser(comment, user)
                .ifPresent(r -> {
                    if (r.getKind() == ReactionKind.DISLIKE && Boolean.TRUE.equals(r.getIsValid())) {
                        r.cancel();
                    }
                });
        syncCounts(comment);
    }

    private void createLikeInternal(Comment comment, User user) {
        Optional<CommentReaction> opt = commentReactionRepository.findByCommentAndUser(comment, user);
        if (opt.isEmpty()) {
            commentReactionRepository.save(CommentReaction.builder()
                    .comment(comment)
                    .user(user)
                    .kind(ReactionKind.LIKE)
                    .build());
            syncCounts(comment);
            return;
        }
        CommentReaction r = opt.get();
        if (!Boolean.TRUE.equals(r.getIsValid())) {
            r.applyActive(ReactionKind.LIKE);
            syncCounts(comment);
            return;
        }
        if (r.getKind() == ReactionKind.DISLIKE) {
            r.applyActive(ReactionKind.LIKE);
            syncCounts(comment);
        }
    }

    private void createDislikeInternal(Comment comment, User user) {
        Optional<CommentReaction> opt = commentReactionRepository.findByCommentAndUser(comment, user);
        if (opt.isEmpty()) {
            commentReactionRepository.save(CommentReaction.builder()
                    .comment(comment)
                    .user(user)
                    .kind(ReactionKind.DISLIKE)
                    .build());
            syncCounts(comment);
            return;
        }
        CommentReaction r = opt.get();
        if (!Boolean.TRUE.equals(r.getIsValid())) {
            r.applyActive(ReactionKind.DISLIKE);
            syncCounts(comment);
            return;
        }
        if (r.getKind() == ReactionKind.LIKE) {
            r.applyActive(ReactionKind.DISLIKE);
            syncCounts(comment);
        }
    }

    private void syncCounts(Comment comment) {
        int likes = commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, ReactionKind.LIKE);
        int dislikes = commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, ReactionKind.DISLIKE);
        comment.syncReactionCounts(likes, dislikes);
    }
}
