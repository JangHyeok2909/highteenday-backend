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
    public Comment creatComment(Post post,User user, RequestCommentDto dto){

        Comment comment = Comment.builder()
                .user(user)
                .post(post)
                .content(dto.getContent())
                .isAnonymous(dto.isAnonymous())
                .s3Url(dto.getUrl())
                .build();
        System.out.println("likecount="+comment.getLikeCount()+"dislike count="+comment.getDislikeCount());
        if(dto.getParentId() != null) comment.setParent(findCommentById(dto.getParentId()));
        int commentCount = commentRepository.findByPost(post).size();
        post.updateCommentCount(commentCount);

        return commentRepository.save(comment);
    }
    @Transactional
    public void updateComment(Long commentId, Long userId, RequestCommentDto dto){
        Comment comment = findCommentById(commentId);
        comment.updateContent(dto.getContent());
        comment.setUpdatedBy(userId);
        commentMediaService.processUpdateCommentMedia(userId,comment,dto);

        log.info("comment updated. commentId={}, updatedBy={}",commentId,userId);
    }
    @Transactional
    public void deleteComment(Long commentId,Long userId){
        Comment comment = findCommentById(commentId);
        comment.delete();
        comment.setUpdatedBy(userId);
        log.info("comment deleted. commentId={}, deletedBy={}",commentId,userId);
    }
}
