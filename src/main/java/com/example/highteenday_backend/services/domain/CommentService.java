package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@RequiredArgsConstructor
@Service
public class CommentService {
    private final CommentRepository commentRepository;
    private final MediaProcessingService mediaProcessingService;
    private final ApplicationEventPublisher eventPublisher ;

    public Comment findCommentById(Long commentId){
        return commentRepository.findById(commentId).
                orElseThrow(()->new ResourceNotFoundException("does not exists Comment, commentId="+commentId));
    }


    public List<Comment> getCommentsByPost(Post post){
        List<Comment> comments = commentRepository.findByPost(post);
        return comments;
    }


    public Page<Comment> getCommentsByUser(User user, int page, int size, SortType sortType){
        Sort sort = Sort.by(Sort.Direction.DESC, sortType.getField());

        Pageable pageable = PageRequest.of(page, size, sort);
        return commentRepository.findByUser(user, pageable);
    }

    @Transactional
    public Comment createComment(Post post, User user, RequestCommentDto dto){

        Comment comment = Comment.create(user, post, dto.getContent(), dto.isAnonymous(), dto.getUrl());
        if (dto.getParentId() != null) comment.assignParent(findCommentById(dto.getParentId()));
        post.incrementCommentCount();

        comment = commentRepository.save(comment);
        Long userId = user.getId();
        if(dto.getUrl() != null && !dto.getUrl().isEmpty()) mediaProcessingService.processCreateCommentMedia(userId,comment,dto);
        comment.setUpdatedBy(null);

        eventPublisher.publishEvent(
                CommentCreatedEvent.builder()
                        .commentId(comment.getId())
                        .postId(post.getId())
                        .authorId(userId)
                        .postAuthorId(post.getUser().getId())
                        .parentCommentAuthorId(
                                comment.getParent() !=null?comment.getParent().getId():null
                        )
                        .content(comment.getContent())
                        .build()
        );
        return comment;
    }


    @Transactional
    public void updateComment(Long commentId, Long userId, RequestCommentDto dto){
        Comment comment = findCommentById(commentId);
        comment.editContent(dto.getContent());
        comment.setUpdatedBy(userId);
        mediaProcessingService.processUpdateCommentMedia(comment,dto);

        log.info("comment updated. commentId={}, updatedBy={}",commentId,userId);
    }
    @Transactional
    public void deleteComment(Long commentId,Long userId){
        Comment comment = findCommentById(commentId);
        Post post = comment.getPost();
        comment.delete();
        comment.setUpdatedBy(userId);
        post.decrementCommentCount();
        log.info("comment deleted. commentId={}, deletedBy={}",commentId,userId);
    }
}
