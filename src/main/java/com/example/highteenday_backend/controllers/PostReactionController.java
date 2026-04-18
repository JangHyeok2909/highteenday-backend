package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.PostReactionService;
import com.example.highteenday_backend.services.domain.PostService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "게시글 좋아요 API", description = "게시글 좋아요,싫어요 실행 API")
@RequiredArgsConstructor
@RequestMapping("/api/posts/{postId}")
@RestController
public class PostReactionController {
    private final PostService postService;
    private final PostReactionService postReactionService;

    @Operation(summary = "게시글 반응", description = "type=LIKE 또는 type=DISLIKE")
    @PostMapping("/reaction")
    public ResponseEntity<LikeStateDto> react(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                              @PathVariable Long postId,
                                              @RequestParam PostReactionKind type) {
        User user = userPrincipal.getUser();
        Post post = postService.findById(postId);

        if (type == PostReactionKind.LIKE) {
            postReactionService.likeReact(post, user);
        } else {
            postReactionService.dislikeReact(post, user);
        }

        LikeStateDto stateDto = LikeStateDto.builder()
                .postId(postId)
                .likeCount(post.getLikeCount())
                .dislikeCount(post.getDislikeCount())
                .build();
        return ResponseEntity.ok(stateDto);
    }
}
