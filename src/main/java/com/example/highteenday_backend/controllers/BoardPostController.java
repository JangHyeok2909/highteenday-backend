package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.PagedPostsDto;
import com.example.highteenday_backend.dtos.PostDto;
import com.example.highteenday_backend.enums.PostSortType;
import com.example.highteenday_backend.services.domain.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@RequiredArgsConstructor
@RestController
@RequestMapping("/api/boards")
public class BoardPostController {
    private final PostService postService;
    static final int SIZE = 10;

    @GetMapping("/{boardId}/posts")
    public ResponseEntity<PagedPostsDto> getPostsByBoardId(@PathVariable Long boardId,
                                                           @RequestParam Integer page,
                                                           @RequestParam PostSortType sortType){
        if(page == null) page = 0;
        Page<Post> pagedPosts = postService.getPosts(boardId, page, SIZE,sortType);
        PagedPostsDto pagedPostsDto = pageToDto(pagedPosts);
        return ResponseEntity.ok(pagedPostsDto);
    }



    private static PagedPostsDto pageToDto(Page<Post> pagedPosts){
        List<Post> posts = pagedPosts.getContent();
        List<PostDto> postDtos =new ArrayList<>();
        for(Post p:posts){
            PostDto postDto = PostDto.builder()
                    .author(p.getUser().getNickname())
                    .title(p.getTitle())
                    .content(p.getContent())
                    .viewCount(p.getViewCount())
                    .likeCount(p.getLikeCount())
                    .build();

            postDtos.add(postDto);
        }
        PagedPostsDto pagedDto = PagedPostsDto.builder()
                .page(pagedPosts.getNumber())
                .totalPages(pagedPosts.getTotalPages())
                .totalElements(pagedPosts.getTotalElements())
                .postDtos(postDtos)
                .build();

        return pagedDto;
    }
}
