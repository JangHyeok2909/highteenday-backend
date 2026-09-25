package com.example.highteenday_backend.controllers;

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

@Tag(name = "게시글 반응 API", description = "게시글 좋아요·싫어요 설정과 해제")
@RequiredArgsConstructor
@RequestMapping("/api/posts/{postId}/reaction")
@RestController
public class PostReactionController {
    private final ReactionService reactionService;

    @Operation(summary = "게시글 반응 설정", description = "내 반응을 kind 로 맞춘다. 같은 요청을 반복해도 결과가 같다.")
    @PutMapping
    public ResponseEntity<LikeStateDto> set(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                            @PathVariable Long postId,
                                            @Valid @RequestBody RequestReactionDto request) {
        Long userId = userPrincipal.getUser().getId();
        return ResponseEntity.ok(reactionService.set(ReactionTarget.POST, postId, userId, request.kind()));
    }

    @Operation(summary = "게시글 반응 해제", description = "반응이 없어도 200 과 현재 상태를 돌려준다.")
    @DeleteMapping
    public ResponseEntity<LikeStateDto> clear(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                              @PathVariable Long postId) {
        Long userId = userPrincipal.getUser().getId();
        return ResponseEntity.ok(reactionService.clear(ReactionTarget.POST, postId, userId));
    }

}
