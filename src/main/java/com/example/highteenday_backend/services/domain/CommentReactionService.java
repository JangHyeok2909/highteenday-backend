package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentReaction;
import com.example.highteenday_backend.domain.comments.CommentReactionRepository;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

@RequiredArgsConstructor
@Service
public class CommentReactionService {

    private final CommentReactionRepository commentReactionRepository;

    public boolean isLikedByUser(Comment comment, User user) {
        return commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.LIKE);
    }

    public boolean isDislikedByUser(Comment comment, User user) {
        return commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.DISLIKE);
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
        comment.updateLikeCount(commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, PostReactionKind.LIKE));
        comment.updateDislikeCount(commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, PostReactionKind.DISLIKE));
    }
}
