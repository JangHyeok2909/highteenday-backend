package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.Utils.PageUtils;
import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.paged.PagedCommentsDto;
import com.example.highteenday_backend.dtos.paged.PagedPostsDto;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.CommentService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.ScrapService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;


@RequiredArgsConstructor
@RequestMapping("/api/mypage")
@RestController
public class MypageController {
    private final PostService postService;
    private final CommentService commentService;
    private final ScrapService scrapService;
    private final int PAGE_SIZE = 10;

    @GetMapping("/posts")
    public ResponseEntity<?> getUserPosts(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                          @RequestParam Integer page,
                                          @RequestParam SortType sortType){
        User user = userPrincipal.getUser();
        Page<Post> pagedPosts = postService.getPagedPostsByUser(user, page, PAGE_SIZE, sortType);
        PagedPostsDto pagedPostsDto = PageUtils.postsToDto(pagedPosts);
        return ResponseEntity.ok(pagedPostsDto);
    }
    @GetMapping("/comments")
    public ResponseEntity<?> getUserComments(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                             @RequestParam Integer page,
                                             @RequestParam SortType sortType){
        User user = userPrincipal.getUser();
        Page<Comment> pagedComments = commentService.getCommentsByUser(user, page, PAGE_SIZE, sortType);
        PagedCommentsDto pagedCommentsDto = PageUtils.commentsToDto(pagedComments);
        return ResponseEntity.ok(pagedCommentsDto);
    }
    @GetMapping("/scraps")
    public ResponseEntity<?> getUserScraps(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                           @RequestParam Integer page
                                           ){
        User user = userPrincipal.getUser();
        List<Scrap> scraps = scrapService.getRecentScrapsByUser(user);
        List<Post> posts=new ArrayList<>();
        for(Scrap s : scraps) posts.add(s.getPost());
        Pageable pageable = PageRequest.of(page, PAGE_SIZE);
        Page<Post> pagedPosts = PageUtils.createPage(posts, pageable);
        PagedPostsDto pagedPostsDto = PageUtils.postsToDto(pagedPosts);
        return ResponseEntity.ok(pagedPostsDto);
    }

}
