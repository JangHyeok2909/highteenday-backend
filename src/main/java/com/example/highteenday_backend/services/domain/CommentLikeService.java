package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentLike;
import com.example.highteenday_backend.domain.comments.CommentLikeRepository;
import com.example.highteenday_backend.domain.users.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

@RequiredArgsConstructor
@Service
public class CommentLikeService {
    private final CommentLikeRepository commentLikeRepository;


    public boolean isLikedByUser(Comment comment, User user){
        Optional<CommentLike> commentLike = commentLikeRepository.findByCommentAndUser(comment, user);
        if(commentLike.isEmpty()) return false;
        return true;
    }
    public CommentLike createLike(Comment comment, User user){
        Optional<CommentLike> commentLike = commentLikeRepository.findByCommentAndUser(comment, user);
        if(commentLike.isEmpty()){
            CommentLike newCommentLike = CommentLike.builder()
                    .comment(comment)
                    .user(user)
                    .build();
            return commentLikeRepository.save(newCommentLike);
        } else {
            return commentLike.get();
        }
    }

    public void cancelLike(Comment comment, User user){
        Optional<CommentLike> commentLike = commentLikeRepository.findByCommentAndUser(comment, user);
        if(commentLike.isEmpty()) return;
        commentLikeRepository.delete(commentLike.get());
    }


}
