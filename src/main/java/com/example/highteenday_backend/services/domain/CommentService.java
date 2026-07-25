package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.exceptions.CustomException;
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
    private final PostRepository postRepository;
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
        postRepository.incrementCommentCount(post.getId());

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


    /**
     * 댓글 작성자 본인인지 확인한다. 익명 댓글도 작성자 식별은 USR_id로 이루어지므로
     * 익명 여부와 무관하게 동일하게 적용된다.
     */
    private void verifyAuthor(Comment comment, Long userId) {
        if (!comment.getUser().getId().equals(userId)) {
            log.warn("[Comment] unauthorized mutation attempt. commentId={}, requesterId={}", comment.getId(), userId);
            throw new CustomException(ErrorCode.NO_ACCESS);
        }
    }

    @Transactional
    public void updateComment(Long commentId, Long userId, RequestCommentDto dto){
        Comment comment = findCommentById(commentId);
        verifyAuthor(comment, userId);
        comment.editContent(dto.getContent());
        comment.setUpdatedBy(userId);
        mediaProcessingService.processUpdateCommentMedia(comment,dto);

        log.info("comment updated. commentId={}, updatedBy={}",commentId,userId);
    }
    @Transactional
    public void deleteComment(Long commentId,Long userId){
        Comment comment = findCommentById(commentId);
        verifyAuthor(comment, userId);
        comment.delete();
        comment.setUpdatedBy(userId);
        postRepository.decrementCommentCount(comment.getPost().getId());
        log.info("comment deleted. commentId={}, deletedBy={}",commentId,userId);
    }
}
