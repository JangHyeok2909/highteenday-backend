package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Slf4j
@RequiredArgsConstructor
@Service
public class CommentService {
    private final CommentRepository commentRepository;
    private final UserService userService;
    private final CommentMediaService commentMediaService;


    public Comment findCommentById(Long commentId){
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
                .s3Url(dto.getUrl())
                .build();


        return commentRepository.save(comment);
    }
    @Transactional
    public void updateComment(Long commentId,RequestCommentDto dto){
        Comment comment = findCommentById(commentId);
        comment.updateContent(dto.getContent());
        comment.setUpdatedBy(dto.getUserId());
        commentMediaService.processUpdateCommentMedia(dto.getUserId(),comment,dto);

        log.info("comment updated. commentId={}, updatedBy={}",commentId,dto.getUserId());
    }
    @Transactional
    public void deleteComment(Long commentId,Long userId){
        Comment comment = findCommentById(commentId);
        comment.delete();
        comment.setUpdatedBy(userId);
        log.info("comment deleted. commentId={}, deletedBy={}",commentId,userId);
    }
}
