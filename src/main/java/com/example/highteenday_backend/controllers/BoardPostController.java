package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.Utils.PageUtils;
import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.paged.PagedPostsDto;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.services.domain.BoardService;
import com.example.highteenday_backend.services.domain.PostService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "게시판의 게시글 페이징 API", description = "특정 게시판의 게시글 한 페이지에 10개씩 조회가능")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/boards/{boardId}/posts")
public class BoardPostController {
    private final BoardService boardService;
    private final PostService postService;
    static final int PAGE_SIZE = 10;

    @Operation(summary = "게시글 리스트 조회",description = "boardId의 게시판에 해당되는 게시글 리스트 조회")
    @GetMapping()
    public ResponseEntity<PagedPostsDto> getPostsByBoardId(@PathVariable Long boardId,
                                                           @RequestParam Integer page,
                                                           @RequestParam SortType sortType){
        Board board = boardService.findById(boardId);
        if(page == null) page = 0;
        Page<Post> pagedPosts = postService.getPagedPostsByBoardId(boardId, page, PAGE_SIZE,sortType);

        PagedPostsDto pagedPostsDto = PageUtils.postsToDto(pagedPosts);
        pagedPostsDto.setBoardName(board.getName());
        return ResponseEntity.ok(pagedPostsDto);
    }


}
