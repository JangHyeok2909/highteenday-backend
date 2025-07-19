package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.PostDto;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.dtos.UpdatePostDto;
import com.example.highteenday_backend.services.domain.PostMediaService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.ViewCountService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;


@Tag(name = "게시글 API", description = "게시글 관련 조회,생성,수정,삭제 API")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/posts")
public class PostController {
    private final PostService postService;
    private final ViewCountService viewCountService;

    @GetMapping("/{postId}")
    public ResponseEntity<PostDto> getPostByPostId(@PathVariable Long postId,
                                                   @RequestParam Long userId){
        PostDto postDto = postService.findById(postId).toDto();
        viewCountService.increaseViewCount(postId,userId);
        return ResponseEntity.ok(postDto);
    }

    //로그찍기,중복제거
    //userId 대신 스프링 시큐리티로 가져오기
    //파일 업로드하는 부분하여 분리하고 파싱해서 html content 전송할 것
    @PostMapping()
    public ResponseEntity<URI> createPost(@RequestBody RequestPostDto requestPostDto){
        Post post = postService.createPost(requestPostDto);
        return ResponseEntity.created(URI.create("/api/posts/"+post.getId())).build();

    }
    @PutMapping("/{postId}")
    public ResponseEntity updatePost(@PathVariable Long postId,
                                     @RequestBody UpdatePostDto dto){
        postService.updatePost(postId,dto.getUserId(),dto);
        return ResponseEntity.ok("수정 완료.");
    }

    @DeleteMapping("/{postId}")
    public ResponseEntity deletePost(@PathVariable Long postId,Long userId){
        postService.deletePost(postId,userId);
        return ResponseEntity.ok("삭제 완료.");
    }
}
