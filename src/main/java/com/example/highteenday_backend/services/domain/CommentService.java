package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@RequiredArgsConstructor
@Service
public class CommentService {
    private final CommentRepository commentRepository;
    private final UserService userService;


    public Comment getCommentById(Long commentId){
        return commentRepository.findById(commentId).
                orElseThrow(()->new RuntimeException("does not exists Comment, commentId="+commentId));
    }
    public List<Comment> getCommentsByPost(Post post){
        List<Comment> comments = commentRepository.findByPost(post);
        return comments;
    }

    @Transactional
    public Comment creatComment(Post post, RequestCommentDto dto){
        User user = userService.findById(dto.getUserId());
        Comment comment = Comment.builder()
                .user(user)
                .post(post)
                .content(dto.getContent())
                .isAnonymous(dto.isAnonymous())
                .build();
        return commentRepository.save(comment);
    }
}
