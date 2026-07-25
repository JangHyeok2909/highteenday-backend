package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentReaction;
import com.example.highteenday_backend.domain.comments.CommentReactionRepository;
import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RequiredArgsConstructor
@Service
public class CommentReactionService {

    private final CommentReactionRepository commentReactionRepository;
    private final CommentRepository commentRepository;

    public boolean isLikedByUser(Comment comment, User user) {
        return commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.LIKE);
    }

    public boolean isDislikedByUser(Comment comment, User user) {
        return commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.DISLIKE);
    }

    @Transactional
    public void likeReact(Comment comment, User user) {
        lockComment(comment);
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
        lockComment(comment);
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

    public LikeStateDto getLikeSatateDto(Comment comment, User user) {
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

    /**
     * 댓글 목록 전체에 대한 로그인 사용자의 반응 상태를 조회 1번으로 계산한다.
     * 댓글마다 {@link #getLikeSatateDto}를 호출하면 댓글 수의 2배만큼 쿼리가 발생하므로,
     * 목록 응답을 만들 때는 이 메서드를 사용한다.
     *
     * @return 댓글 id를 키로 하는 반응 상태 맵 (모든 댓글에 대한 항목이 존재)
     */
    public Map<Long, LikeStateDto> getLikeStates(List<Comment> comments, User user) {
        if (comments.isEmpty()) return Map.of();

        List<Long> commentIds = comments.stream().map(Comment::getId).toList();
        // (CMT_id, USR_id) 유니크 제약이 있으므로 댓글당 활성 반응은 최대 1건이다.
        Map<Long, PostReactionKind> reactionKinds =
                commentReactionRepository.findActiveByUserAndCommentIds(user, commentIds).stream()
                        .collect(Collectors.toMap(r -> r.getComment().getId(), CommentReaction::getKind));

        Map<Long, LikeStateDto> states = new HashMap<>();
        for (Comment comment : comments) {
            PostReactionKind kind = reactionKinds.get(comment.getId());
            states.put(comment.getId(), LikeStateDto.builder()
                    .commentId(comment.getId())
                    .isLiked(kind == PostReactionKind.LIKE)
                    .isDisliked(kind == PostReactionKind.DISLIKE)
                    .likeCount(comment.getLikeCount())
                    .dislikeCount(comment.getDislikeCount())
                    .build());
        }
        return states;
    }

    /**
     * 같은 댓글에 대한 반응 처리를 직렬화한다. 트랜잭션이 커밋될 때까지 잠금이 유지되므로
     * 뒤이은 트랜잭션의 재집계 COUNT는 앞선 트랜잭션이 만든 행을 반드시 포함한다.
     */
    private void lockComment(Comment comment) {
        commentRepository.findByIdForUpdate(comment.getId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "does not exists Comment, commentId=" + comment.getId()));
    }

    private void cancelLikeInternal(Comment comment, User user) {
        commentReactionRepository.findByCommentAndUser(comment, user)
                .ifPresent(r -> {
                    if (r.getKind() == PostReactionKind.LIKE && Boolean.TRUE.equals(r.getIsValid())) {
                        r.cancel();
                    }
                });
        syncCounts(comment);
    }

    private void cancelDislikeInternal(Comment comment, User user) {
        commentReactionRepository.findByCommentAndUser(comment, user)
                .ifPresent(r -> {
                    if (r.getKind() == PostReactionKind.DISLIKE && Boolean.TRUE.equals(r.getIsValid())) {
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
                    .kind(PostReactionKind.LIKE)
                    .build());
            syncCounts(comment);
            return;
        }
        CommentReaction r = opt.get();
        if (!Boolean.TRUE.equals(r.getIsValid())) {
            r.applyActive(PostReactionKind.LIKE);
            syncCounts(comment);
            return;
        }
        if (r.getKind() == PostReactionKind.DISLIKE) {
            r.applyActive(PostReactionKind.LIKE);
            syncCounts(comment);
        }
    }

    private void createDislikeInternal(Comment comment, User user) {
        Optional<CommentReaction> opt = commentReactionRepository.findByCommentAndUser(comment, user);
        if (opt.isEmpty()) {
            commentReactionRepository.save(CommentReaction.builder()
                    .comment(comment)
                    .user(user)
                    .kind(PostReactionKind.DISLIKE)
                    .build());
            syncCounts(comment);
            return;
        }
        CommentReaction r = opt.get();
        if (!Boolean.TRUE.equals(r.getIsValid())) {
            r.applyActive(PostReactionKind.DISLIKE);
            syncCounts(comment);
            return;
        }
        if (r.getKind() == PostReactionKind.LIKE) {
            r.applyActive(PostReactionKind.DISLIKE);
            syncCounts(comment);
        }
    }

    private void syncCounts(Comment comment) {
        int likes = commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, PostReactionKind.LIKE);
        int dislikes = commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, PostReactionKind.DISLIKE);
        comment.syncReactionCounts(likes, dislikes);
    }
}
