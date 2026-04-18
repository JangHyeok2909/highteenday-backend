package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.CommentReactionService;
import com.example.highteenday_backend.services.domain.CommentService;
import io.swagger.v3.oas.annotations.Operation;
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
    private final CommentReactionService commentReactionService;

    @Operation(summary = "댓글 반응", description = "type=LIKE 또는 type=DISLIKE")
    @PostMapping("/reaction")
    public ResponseEntity<LikeStateDto> react(@PathVariable Long commentId,
                                              @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                              @RequestParam PostReactionKind type) {
        User user = userPrincipal.getUser();
        Comment comment = commentService.findCommentById(commentId);

        if (type == PostReactionKind.LIKE) {
            commentReactionService.likeReact(comment, user);
        } else {
            commentReactionService.dislikeReact(comment, user);
        }

        return ResponseEntity.ok(commentReactionService.getLikeSatateDto(comment, user));
    }
}
