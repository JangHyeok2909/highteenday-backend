package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.PagedPostsDto;
import com.example.highteenday_backend.dtos.PostDto;
import com.example.highteenday_backend.enums.PostSortType;
import com.example.highteenday_backend.services.domain.BoardService;
import com.example.highteenday_backend.services.domain.PostService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@Tag(name = "게시판 API", description = "특정 게시판의 게시글 한 페이지에 10개씩 조회가능")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/boards")
public class BoardPostController {
    private final BoardService boardService;
    private final PostService postService;
    static final int SIZE = 10;
    @Operation(summary = "게시글 리스트 조회",description = "boardId의 게시판에 해당되는 게시글 리스트 조회")
    @GetMapping("/{boardId}/posts")
    public ResponseEntity<PagedPostsDto> getPostsByBoardId(@PathVariable Long boardId,
                                                           @RequestParam Integer page,
                                                           @RequestParam PostSortType sortType){
        Board board = boardService.findById(boardId);
        if(page == null) page = 0;
        Page<Post> pagedPosts = postService.getPosts(boardId, page, SIZE,sortType);

        PagedPostsDto pagedPostsDto = pageToDto(pagedPosts);
        pagedPostsDto.setBoardName(board.getName());
        return ResponseEntity.ok(pagedPostsDto);
    }

    private static PagedPostsDto pageToDto(Page<Post> pagedPosts){
        List<Post> posts = pagedPosts.getContent();
        List<PostDto> postDtos =new ArrayList<>();
        for(Post p:posts){
            PostDto postDto = PostDto.builder()
                    .id(p.getId())
                    .author(p.getUser().getNickname())
                    .title(p.getTitle())
                    .content(p.getContent())
                    .viewCount(p.getViewCount())
                    .likeCount(p.getLikeCount())
                    .dislikeCount(p.getDislikeCount())
                    .createdAt(p.getCreated())
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
