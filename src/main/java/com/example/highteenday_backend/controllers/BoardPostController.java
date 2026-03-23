package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PageResponse;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.redisService.RedisPostsCache;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "게시판의 게시글 페이징 API", description = "특정 게시판의 게시글 한 페이지에 10개씩 조회가능")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/boards/{boardId}/posts")
public class BoardPostController {
    private final PostService postService;
    private final RedisPostsCache postsCache;
    static final int CACHE_PAGE = 5;
    static final int DEFAULT_SIZE = 10;

//    @Operation(summary = "게시글 리스트 조회",description = "boardId의 게시판에 해당되는 게시글 리스트 조회")
//    @GetMapping()
//    public ResponseEntity<PageResponse> getPostsByBoardId(@PathVariable Long boardId,
//                                                           @RequestParam Integer page,
//                                                           @RequestParam SortType sortType){
//        if(page == null) page = 0;
//         PostListingDto dto= PostListingDto.builder()
//                .boardId(boardId)
//                .page(page)
//                 .sortType(sortType)
//                 .size(PAGE_SIZE)
//                 .build();
//        PageResponse<PostPreviewDto> pagedPostDResponseDto = postService.getPagedPostsByBoardId(dto);
//
//
//        return ResponseEntity.ok(pagedPostDResponseDto);
//    }
    @Operation(summary = "게시글 리스트 조회",description = "boardId의 게시판에 해당되는 게시글 리스트 조회")
    @GetMapping()
    public ResponseEntity<PageResponse> getPostsByBoardId(@PathVariable Long boardId,
                                                          @RequestParam(defaultValue = "0") Integer page,
                                                          @RequestParam(defaultValue = "RECENT") SortType sortType,
                                                          @RequestParam(defaultValue = "10") int size,
                                                          @RequestParam(required = false) Long lastSeedId,
                                                          @RequestParam(defaultValue = "true") boolean isRandomPage){
        if(page == null) page = 0;
        if(size <= 0 || size > 50) size = DEFAULT_SIZE;
        PostListingDto dto= PostListingDto.builder()
                .boardId(boardId)
                .page(page)
                .sortType(sortType)
                .size(size)
                .lastSeedId(lastSeedId)
                .isRandomPage(isRandomPage)
                .build();

        //최신순의 경우 0~4페이지까지 캐시
        List<PostPreviewDto> postPrevs;
        if(page<CACHE_PAGE && dto.getSortType() == SortType.RECENT) {
            postPrevs = postsCache.getPostPrevs(boardId, page, size);
        }
        //아닐경우 db조회
        else {
            postPrevs = postService.getPagedPosts(dto);
        }

        Long count = postsCache.getCount(boardId);
        PageResponse pagedPosts = new PageResponse<>(postPrevs, page, size, count);
        return ResponseEntity.ok(pagedPosts);
    }
}