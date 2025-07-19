package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.ScrapService;
import com.example.highteenday_backend.services.domain.UserService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "게시글 스크랩 API", description = "게시글 스크랩/스크랩 취소")
@RequestMapping("/api/posts/{postId}/scraps")
@RequiredArgsConstructor
@RestController
public class ScrapController {
    private final PostService postService;
    private final UserService userService;
    private final ScrapService scrapService;

    @PostMapping()
    public ResponseEntity<?> scrap(@PathVariable Long postId,
                                   @RequestParam Long userId){
        Post post = postService.findById(postId);
        User user = userService.findById(userId);
        boolean scraped = scrapService.isScraped(post, user);
        if(!scraped){
            scrapService.createScrap(post,user);
        } else{
            scrapService.cancelScrap(post,user);
        }
        return ResponseEntity.ok("스크립 완료.");
    }
}
