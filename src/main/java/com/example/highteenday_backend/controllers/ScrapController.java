package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.ScrapService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "게시글 스크랩 API", description = "게시글 스크랩/스크랩 취소")
@RequestMapping("/api/posts/{postId}/scraps")
@Slf4j
@RequiredArgsConstructor
@RestController
public class ScrapController {
    private final PostService postService;
    private final ScrapService scrapService;

    @PostMapping()
    public ResponseEntity<?> scrap(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                   @PathVariable Long postId
                                   ){
        if(userPrincipal == null) {
            log.warn("스크랩 요청 시 인증 정보 없음. postId={}", postId);
        }
        User user = userPrincipal.getUser();
        Post post = postService.findById(postId);
        boolean scraped = scrapService.isScraped(post, user);
        String message;
        if(!scraped){
            scrapService.createScrap(post,user);
            message ="스크랩 완료.";
        } else{
            scrapService.cancelScrap(post,user);
            message ="스크랩 취소.";
        }
        post.updateScrapCount(Math.toIntExact(scrapService.countValidByPost(post)));
        return ResponseEntity.ok(message);
    }
}
