package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.users.User;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;


@RequiredArgsConstructor
@Service
public class CommentReactService {
    private final CommentLikeService commentLikeService;
    private final CommentDislikeService commentDislikeService;

    @Transactional
    public void likeReact(Comment comment, User user){
        boolean liked = commentLikeService.isLikedByUser(comment, user);
        boolean disliked = commentDislikeService.isDislikedByUser(comment, user);
        //좋아요 누른상태
        if(liked && !disliked){
            commentLikeService.cancelLike(comment, user);
            comment.minusLikeCount();
        }
        //싫어요 누른상태
        else if (!liked && disliked) {
            commentDislikeService.cancelDislike(comment, user);
            commentLikeService.createLike(comment, user);
            comment.plusLikeCount();
            comment.minusDislikeCount();
        }
        //아무것도 안 누른 상태
        else{
            commentLikeService.createLike(comment, user);
            comment.plusLikeCount();
        }
    }
    @Transactional
    public void dislikeReact(Comment comment, User user){
        boolean liked = commentLikeService.isLikedByUser(comment, user);
        boolean disliked = commentDislikeService.isDislikedByUser(comment, user);
        //좋아요 누른상태
        if(liked && !disliked){
            commentLikeService.cancelLike(comment, user);
            commentDislikeService.createDislike(comment, user);
            comment.minusLikeCount();
            comment.plusDislikeCount();
        }
        //싫어요 누른상태
        else if (!liked && disliked) {
            commentDislikeService.cancelDislike(comment, user);
            comment.minusDislikeCount();
        }
        //아무것도 안 누른 상태
        else{
            commentDislikeService.createDislike(comment, user);
            comment.plusDislikeCount();
        }
    }
}
