package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.posts.PostLike;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.services.domain.PostLikeService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RequiredArgsConstructor
@RequestMapping("/api/posts")
@RestController
public class PostLikeController {
    private final PostLikeService postLikeService;
    private final PostService postService;
    private final UserService userService;

    @PostMapping("/{postId}/postlike")
    public ResponseEntity<Integer> createPostLike(Long userId, @PathVariable Long postId){
        User user = userService.findById(userId);
        Post post = postService.findById(postId);
        PostLike postLike = PostLike.builder()
                .user(user)
                .post(post)
                .isLiked(true)
                .build();
        postLikeService.createPostLike(postLike);
        int updatedLikeCount = postService.updateLikeCount(post);

        return ResponseEntity.ok(updatedLikeCount);

    }
    @PutMapping("/{postId}/postlikes/{postLikeId}")
    public ResponseEntity<Integer> updatePostLike(@PathVariable Long postId,@PathVariable Long postLikeId){
        Post post = postService.findById(postId);
        PostLike postLike = postLikeService.findById(postLikeId);
        postLike.updateLikeFlag();
        int updatedLikeCount = postService.updateLikeCount(post);

        return ResponseEntity.ok(updatedLikeCount);
    }
}
