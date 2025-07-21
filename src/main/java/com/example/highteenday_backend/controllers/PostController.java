package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.dtos.PostDto;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.dtos.UpdatePostDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URI;


@Tag(name = "게시글 API", description = "게시글 관련 조회,생성,수정,삭제 API")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/posts")
public class PostController {
    private final PostService postService;
    private final ViewCountService viewCountService;
    private final PostReactionService postReactionService;
    private final ScrapService scrapService;

    @Operation(summary = "게시글 조회")
    @GetMapping("/{postId}")
    public ResponseEntity<PostDto> getPostByPostId(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                   @PathVariable Long postId
                                                   ){
        Post post = postService.findById(postId);
        PostDto postDto = post.toDto();
        if(userPrincipal != null) {
            User user = userPrincipal.getUser();
            LikeStateDto likestate = postReactionService.getLikeSatateDto(post, user);
            postDto.setLiked(likestate.isLiked());
            postDto.setDisliked(likestate.isDisliked());
            postDto.setOwner(post.getUser().getId() == user.getId());
            postDto.setScraped(scrapService.isScraped(post, user));
            viewCountService.increaseViewCount(postId,user.getId());
        }

        return ResponseEntity.ok(postDto);
    }

    @PostMapping()
    public ResponseEntity<URI> createPost(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                          @RequestBody RequestPostDto requestPostDto){
        User user = userPrincipal.getUser();
        Post post = postService.createPost(user,requestPostDto);
        return ResponseEntity.created(URI.create("/api/posts/"+post.getId())).build();

    }
    @PutMapping("/{postId}")
    public ResponseEntity updatePost(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                     @PathVariable Long postId,
                                     @RequestBody UpdatePostDto dto){
        User user = userPrincipal.getUser();
        postService.updatePost(postId,user.getId(),dto);
        return ResponseEntity.ok("수정 완료.");
    }

    @DeleteMapping("/{postId}")
    public ResponseEntity deletePost(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                     @PathVariable Long postId){
        User user = userPrincipal.getUser();
        postService.deletePost(postId,user.getId());
        return ResponseEntity.ok("삭제 완료.");
    }

//    @Operation(summary = "게시글 조회 테스트")
//    @GetMapping("/{postId}/test/{userId}")
//    public ResponseEntity<PostDto> getPostByPostIdTest(@PathVariable Long postId,
//                                                       @PathVariable Long userId){
//        PostDto postDto = postService.findById(postId).toDto();
//        viewCountService.increaseViewCount(postId,userId);
//        return ResponseEntity.ok(postDto);
//    }
}
