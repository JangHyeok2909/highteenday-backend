package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.reactions.ReactionKind;
import com.example.highteenday_backend.domain.reactions.ReactionTarget;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.dtos.RequestReactionDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.ReactionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "댓글 반응 API", description = "댓글 좋아요·싫어요 설정과 해제")
@RequiredArgsConstructor
@RequestMapping("/api/comments/{commentId}/reaction")
@RestController
public class CommentReactionController {
    private final ReactionService reactionService;

    @Operation(summary = "댓글 반응 설정", description = "내 반응을 kind 로 설정. 같은 요청을 반복해도 결과가 같다.")
    @PutMapping
    public ResponseEntity<LikeStateDto> set(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                            @PathVariable Long commentId,
                                            @Valid @RequestBody RequestReactionDto request) {
        Long userId = userPrincipal.getUser().getId();
        return ResponseEntity.ok(reactionService.set(ReactionTarget.COMMENT, commentId, userId, request.kind()));
    }

    @Operation(summary = "댓글 반응 해제", description = "반응이 없어도 200 과 현재 상태를 돌려준다.")
    @DeleteMapping
    public ResponseEntity<LikeStateDto> clear(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                              @PathVariable Long commentId) {
        Long userId = userPrincipal.getUser().getId();
        return ResponseEntity.ok(reactionService.clear(ReactionTarget.COMMENT, commentId, userId));
    }

}
