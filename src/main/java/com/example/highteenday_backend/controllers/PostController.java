package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.Utils.MediaUtils;
import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.PostDto;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.services.domain.MediaService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.global.S3Service;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;



@Tag(name = "게시글 API", description = "게시글 관련 조회,생성,수정,삭제 API")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/posts")
public class PostController {
    private final PostService postService;
    private final MediaService mediaService;
    private final S3Service s3Service;


    @GetMapping("/{postId}")
    public ResponseEntity<PostDto> getPostByPostId(@PathVariable Long postId){
        PostDto postDto = postService.findById(postId).toDto();
        return ResponseEntity.ok(postDto);
    }

    //로그찍기,중복제거
    //userId 대신 스프링 시큐리티로 가져오기
    //파일 업로드하는 부분하여 분리하고 파싱해서 html content 전송할 것
    @PostMapping()
    public ResponseEntity<URI> createPost(@RequestBody RequestPostDto requestPostDto){
        //tmp request dto set
        Long boardId = requestPostDto.getBoardId();
        Long userId = requestPostDto.getUserId();
        boolean isAnonymous = requestPostDto.isAnonymous();
        String title = requestPostDto.getTitle();
        String content = requestPostDto.getContent();

        ResponseEntity<URI> responseUrl;
        //게시글의 content의 url을 파싱.
        List<String> urls = MediaUtils.extractS3Urls(content);
        Post post;
        if(urls.isEmpty()) {
            post = postService.createPost(userId, boardId, isAnonymous, title, content);
        } else{
            List<Media> mediaList =new ArrayList<>();
            String replaceUrlContent=content;
            //파싱 된 urls를 통해 tmp에 저장한 이미지를 post-file로 복사
            for(String u : urls){
                String postFileUrl = s3Service.copyToPostFileAndGetUrl(u);
                //post-file의 postFileUrl 가져와서 content의 기존 url 대체
                replaceUrlContent = replaceUrlContent.replace(u,postFileUrl);
                FileInfo fileInfo = s3Service.getFileInfo(s3Service.getKeyByUrl(postFileUrl));
                //media 저장
                mediaList.add(mediaService.save(fileInfo));
            }
            //url이 대체된 content를 post에 저장, mediaList에 post 매핑
            post = postService.createPost(userId, boardId, isAnonymous, title, replaceUrlContent);
            for(Media m:mediaList){
                m.setPost(post);
            }
            //유저의 tmp 전부 삭제
            s3Service.deleteUserTmp(userId);
        }

        responseUrl = ResponseEntity.created(URI.create("/api/posts/"+post.getId())).build();
        return responseUrl;

    }


}
