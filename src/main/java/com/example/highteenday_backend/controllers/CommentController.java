package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.CommentDto;
import com.example.highteenday_backend.dtos.DeleteRequestDto;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.services.domain.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;


@Tag(name = "댓글 API", description = "댓글 관련 조회,생성,수정,삭제 API")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/posts/{postId}/comments")
public class CommentController {
    private final UserService userService;
    private final PostService postService;
    private final CommentService commentService;
    private final CommentMediaService commentMediaService;
    private final CommentLikeService commentLikeService;
    private final CommentDislikeService commentDislikeService;


    @GetMapping()
    public ResponseEntity<List<CommentDto>> getComments(@PathVariable Long postId,
                                                        @RequestParam Long userId){
        Post post = postService.findById(postId);
        List<Comment> comments = commentService.getCommentsByPost(post);
        List<CommentDto> dtos = new ArrayList<>();

        User user = userService.findById(userId);

        if(user != null) {
            for(Comment c : comments){
                CommentDto dto = c.toDto();
                if(commentLikeService.isLikedByUser(c,user)) dto.setLiked(true);
                else if(commentDislikeService.isDislikedByUser(c,user)) dto.setDisliked(true);
                dtos.add(dto);
            }
        } else{
            for(Comment c : comments){
                CommentDto dto = c.toDto();
                dtos.add(dto);
            }
        }

        return ResponseEntity.ok(dtos);
    }
    @GetMapping("/{commentId}")
    public ResponseEntity<CommentDto> getCommentById(@PathVariable Long commentId){
        Comment comment = commentService.findCommentById(commentId);
        return ResponseEntity.ok(comment.toDto());
    }

    @PostMapping()
    public ResponseEntity createComment(@PathVariable Long postId,
                                          @RequestBody RequestCommentDto dto){
        Post post = postService.findById(postId);
        Comment comment = commentService.creatComment(post, dto);
        commentMediaService.processCreateCommentMedia(dto.getUserId(),comment,dto);
        URI location = URI.create("/api/posts/"+postId+"/comments/"+comment.getId());
        return ResponseEntity.created(location).build();
    }

    @PutMapping("/{commentId}")
    public ResponseEntity updateComment(@PathVariable Long commentId,
                                        @RequestBody RequestCommentDto dto){
        commentService.updateComment(commentId,dto);
        return ResponseEntity.ok("수정 완료.");
    }

    @DeleteMapping("/{commentId}")
    public ResponseEntity deleteComment(@PathVariable Long commentId,
                                        @RequestBody DeleteRequestDto dto){
        commentService.deleteComment(commentId,dto.getUserId());
        return ResponseEntity.ok("삭제 완료.");
    }

}
