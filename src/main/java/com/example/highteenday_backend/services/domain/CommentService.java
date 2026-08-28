package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.enums.ErrorCode;
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
                                comment.getParent() !=null?comment.getParent().getUser().getId():null
                        )
                        .content(comment.getContent())
                        .build()
        );

        // 카운터 증가는 **메서드 맨 끝**에서 한다. 이 쿼리는 clearAutomatically 라 영속성
        // 컨텍스트를 비우는데, 중간에서 부르면 위의 post·comment 가 준영속이 되어 지연 로딩
        // (post.getUser())이 깨진다. 엔티티의 commentCount 는 건드리지 않는다 — 값을 같이
        // 맞추면 더티 체킹이 낡은 값으로 UPDATE 를 한 번 더 날려 원자 증감을 덮어쓴다.
        postRepository.incrementCommentCount(post.getId());
        return comment;
    }


    @Transactional
    public void updateComment(Long commentId, Long userId, RequestCommentDto dto){
        Comment comment = findCommentById(commentId);
        validateOwnership(comment, userId);
        comment.editContent(dto.getContent());
        comment.setUpdatedBy(userId);
        mediaProcessingService.processUpdateCommentMedia(comment,dto);

        log.info("comment updated. commentId={}, updatedBy={}",commentId,userId);
    }
    @Transactional
    public void deleteComment(Long commentId,Long userId){
        Comment comment = findCommentById(commentId);
        validateOwnership(comment, userId);
        Long postId = comment.getPost().getId();
        comment.delete();
        comment.setUpdatedBy(userId);
        // 증가와 같은 이유로 DB에서 원자적으로 감소시킨다. postId 를 먼저 꺼내 두는 것은
        // 이 쿼리가 컨텍스트를 비운 뒤 comment.getPost() 를 다시 타지 않기 위해서다.
        postRepository.decrementCommentCount(postId);
        log.info("comment deleted. commentId={}, deletedBy={}",commentId,userId);
    }

    /**
     * 요청자가 댓글 작성자인지 확인한다 (docs/KNOWN-ISSUES.md KI-05).
     *
     * 익명 댓글이라도 작성자 id 는 남아 있으므로 판정 기준은 같다. 게시글 작성자에게
     * 남의 댓글을 지울 권한을 주지는 않았다 — 신고·모더레이션 기능이 따로 없는 상태에서
     * 그 권한을 열면 "글쓴이가 불리한 댓글을 지운다"는 다른 문제가 생긴다.
     */
    private void validateOwnership(Comment comment, Long userId) {
        if (userId == null || !comment.getUser().getId().equals(userId)) {
            throw new CustomException(ErrorCode.NO_ACCESS);
        }
    }
}
