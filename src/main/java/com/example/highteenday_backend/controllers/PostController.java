package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.Utils.PageUtils;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.PostDto;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.dtos.UpdatePostDto;
import com.example.highteenday_backend.dtos.paged.PagedPostsDto;
import com.example.highteenday_backend.enums.PostSearchType;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URI;


@Tag(name = "게시글 API", description = "게시글 관련 조회,생성,수정,삭제 API")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/posts")
public class PostController {
    private final PostService postService;
    private final PostDetailService postDetailService;


    @Operation(summary = "게시글 조회")
    @GetMapping("/{postId}")
    public ResponseEntity<PostDto> getPostByPostId(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                                   @PathVariable Long postId
                                                   ){
        Post post = postService.findById(postId);
        PostDto dto = PostDto.fromEntity(post);
        if (userPrincipal != null) {
            postDetailService.applyUserContext(dto, post, userPrincipal.getUser());
        }
        return ResponseEntity.ok(dto);
    }

    @Operation(summary = "게시글 생성")
    @PostMapping()
    public ResponseEntity<URI> createPost(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                          @Valid @RequestBody RequestPostDto requestPostDto){
        User user = userPrincipal.getUser();
        Post post = postService.createPost(user, requestPostDto);

        return ResponseEntity.created(URI.create("/api/posts/"+post.getId())).build();
    }
    @Operation(summary = "게시글 수정")
    @PatchMapping("/{postId}")
    public ResponseEntity updatePost(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                     @PathVariable Long postId,
                                     @RequestBody UpdatePostDto dto){
        User user = userPrincipal.getUser();
        postService.updatePost(postId,user.getId(),dto);
        return ResponseEntity.ok("수정 완료.");
    }
    @Operation(summary = "게시글 삭제")
    @DeleteMapping("/{postId}")
    public ResponseEntity deletePost(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                     @PathVariable Long postId){
        User user = userPrincipal.getUser();
        postService.deletePost(postId, user.getId());

        return ResponseEntity.ok("삭제 완료.");
    }
    @Operation(summary = "게시글 검색")
    @GetMapping("/search")
    public ResponseEntity<PagedPostsDto> searchPost(@RequestParam String query,
                                                    @RequestParam Integer page,
                                                    @RequestParam PostSearchType searchType){
        Page<Post> pagedPost = postService.searchPagedPosts(query,page, searchType);
        PagedPostsDto dto = PageUtils.postsToDto(pagedPost);

        return ResponseEntity.ok(dto);
    }
}
