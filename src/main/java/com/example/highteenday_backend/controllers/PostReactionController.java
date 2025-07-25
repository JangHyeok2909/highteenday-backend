package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.PostReactionService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.UserService;
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


    @PostMapping("/like")
    public ResponseEntity<LikeStateDto> likeReact(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                  @PathVariable Long postId){
        User user = userPrincipal.getUser();
        Post post = postService.findById(postId);
        postReactionService.likeReact(post,user);

        LikeStateDto stateDto = LikeStateDto.builder()
                .postId(postId)
                .likeCount(post.getLikeCount())
                .dislikeCount(post.getDislikeCount())
                .build();
        return ResponseEntity.ok(stateDto);
    }

    @PostMapping("/dislike")
    public ResponseEntity disLikeReact(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                       @PathVariable Long postId
                                       ){
        User user = userPrincipal.getUser();
        Post post = postService.findById(postId);
        postReactionService.dislikeReact(post,user);

        LikeStateDto stateDto = LikeStateDto.builder()
                .postId(postId)
                .likeCount(post.getLikeCount())
                .dislikeCount(post.getDislikeCount())
                .build();
        return ResponseEntity.ok(stateDto);
    }

}
