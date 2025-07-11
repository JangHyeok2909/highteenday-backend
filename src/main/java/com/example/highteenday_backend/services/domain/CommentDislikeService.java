package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.*;
import com.example.highteenday_backend.domain.users.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

@RequiredArgsConstructor
@Service
public class CommentDislikeService {
    private final CommentDislikeRepository commentDislikeRepository;

    public boolean isDislikedByUser(Comment comment, User user){
        Optional<CommentDislike> commentDislike = commentDislikeRepository.findByCommentAndUser(comment, user);
        if(commentDislike.isEmpty()) return false;
        return true;
    }

    public CommentDislike createDislike(Comment comment, User user){
        Optional<CommentDislike> commentDislike = commentDislikeRepository.findByCommentAndUser(comment, user);
        if(commentDislike.isEmpty()){
            CommentDislike newCommentDislike = CommentDislike.builder()
                    .comment(comment)
                    .user(user)
                    .build();

            return commentDislikeRepository.save(newCommentDislike);
        } else {
            return commentDislike.get();
        }
    }
    public void cancelDislike(Comment comment, User user){
        Optional<CommentDislike> commentDislike = commentDislikeRepository.findByCommentAndUser(comment, user);
        if(commentDislike.isEmpty()) return;
        commentDislikeRepository.delete(commentDislike.get());
    }
}
