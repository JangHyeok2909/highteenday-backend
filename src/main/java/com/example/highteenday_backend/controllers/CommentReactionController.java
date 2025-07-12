package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.services.domain.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "댓글 좋아요 API", description = "댓글 좋아요,싫어요 실행 API")
@RequiredArgsConstructor
@RequestMapping("/api/comment/{commentId}")
@RestController
public class CommentReactionController {
    private final CommentService commentService;
    private final UserService userService;
    private final CommentReactService commentReactService;


    @PostMapping("/like")
    public ResponseEntity<LikeStateDto> likeReact(@RequestParam Long commentId,
                                                  @RequestParam Long userId){
        Comment comment = commentService.findCommentById(commentId);
        User user = userService.findById(userId);
        commentReactService.likeReact(comment,user);

        LikeStateDto stateDto = LikeStateDto.builder()
                .commentId(commentId)
                .likeCount(comment.getLikeCount())
                .dislikeCount(comment.getDislikeCount())
                .build();
        return ResponseEntity.ok(stateDto);
    }

    @PostMapping("/dislike")
    public ResponseEntity disLikeReact(@RequestParam Long commentId,
                                       @RequestParam Long userId){
        Comment comment = commentService.findCommentById(commentId);
        User user = userService.findById(userId);
        commentReactService.dislikeReact(comment,user);

        LikeStateDto stateDto = LikeStateDto.builder()
                .commentId(commentId)
                .likeCount(comment.getLikeCount())
                .dislikeCount(comment.getDislikeCount())
                .build();
        return ResponseEntity.ok(stateDto);
    }
}
