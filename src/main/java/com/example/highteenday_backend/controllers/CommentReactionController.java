package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "댓글 좋아요 API", description = "댓글 좋아요,싫어요 실행 API")
@RequiredArgsConstructor
@RequestMapping("/api/comments/{commentId}")
@RestController
public class CommentReactionController {
    private final CommentService commentService;
    private final UserService userService;
    private final CommentReactService commentReactService;



    @PostMapping("/like")
    public ResponseEntity<LikeStateDto> likeReact(@PathVariable Long commentId,
                                                  @AuthenticationPrincipal CustomUserPrincipal userPrincipal){
        User user = userPrincipal.getUser();
        Comment comment = commentService.findCommentById(commentId);
        commentReactService.likeReact(comment,user);

        LikeStateDto stateDto = LikeStateDto.builder()
                .commentId(commentId)
                .likeCount(comment.getLikeCount())
                .dislikeCount(comment.getDislikeCount())
                .build();
        return ResponseEntity.ok(stateDto);
    }

    @PostMapping("/dislike")
    public ResponseEntity disLikeReact(@PathVariable Long commentId,
                                       @AuthenticationPrincipal CustomUserPrincipal userPrincipal){
        User user = userPrincipal.getUser();
        Comment comment = commentService.findCommentById(commentId);
        commentReactService.dislikeReact(comment,user);

        LikeStateDto stateDto = LikeStateDto.builder()
                .commentId(commentId)
                .likeCount(comment.getLikeCount())
                .dislikeCount(comment.getDislikeCount())
                .build();
        return ResponseEntity.ok(stateDto);
    }

}
