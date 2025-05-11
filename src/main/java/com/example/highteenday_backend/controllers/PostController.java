package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.Utils.MediaUtils;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.PostDto;
import com.example.highteenday_backend.dtos.PostRequestDto;
import com.example.highteenday_backend.services.domain.MediaService;
import com.example.highteenday_backend.services.domain.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;


@RestController
@RequiredArgsConstructor
@RequestMapping("/api/posts")
public class PostController {
    private final PostService postService;
    private final MediaService mediaService;


    @GetMapping("/{postId}")
    public ResponseEntity<PostDto> getPostByPostId(@PathVariable Long postId){
        PostDto postDto = postService.findById(postId).toDto();
        return ResponseEntity.ok(postDto);
    }

    //로그찍기,중복제거
    //userId 대신 스프링 시큐리티로 가져오기
    //파일 업로드하는 부분하여 분리하고 파싱해서 html content 전송할 것
    @PostMapping()
    public ResponseEntity<URI> createPost(@RequestBody PostRequestDto postRequestDto){
        //tmp request dto set
        Long boardId = postRequestDto.getBoardId();
        Long userId = postRequestDto.getUserId();
        boolean isAnonymous = postRequestDto.isAnonymous();
        String title = postRequestDto.getTitle();
        String content = postRequestDto.getContent();

        //post 생성후 content의 url을 파싱하여 해당 url의 media에 post를 링크
        Post post = postService.createPost(userId, boardId, isAnonymous, title, content);
        List<String> urls = MediaUtils.extractS3Urls(content);
        if(urls.isEmpty()) return ResponseEntity.ok(URI.create("/api/posts/"+post.getId()));
        try{
            mediaService.linkMediaToPostByUrls(urls,post);
        } catch (RuntimeException e) {return ResponseEntity.ok(URI.create("/api/posts/"+post.getId()));}

        return ResponseEntity.ok(URI.create("/api/posts/"+post.getId()));
    }






}
