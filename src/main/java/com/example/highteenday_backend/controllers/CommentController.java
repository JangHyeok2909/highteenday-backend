package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.CommentDto;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;


@Tag(name = "댓글 API", description = "댓글 관련 조회,생성,수정,삭제 API")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/posts/{postId}/comments")
public class CommentController {
    private final PostService postService;
    private final CommentService commentService;
    private final CommentReactService commentReactService;

    @Operation(summary = "댓글 리스트 조회",description = "postId에 해당하는 게시글의 댓글 리스트 조회")
    @GetMapping()
    public ResponseEntity<List<CommentDto>> getComments(@PathVariable Long postId,
                                                        @AuthenticationPrincipal CustomUserPrincipal userPrincipal){
        System.out.println("get comments 진입" );
        Post post = postService.findById(postId);
        List<Comment> comments = commentService.getCommentsByPost(post);
        List<CommentDto> dtos = new ArrayList<>();

        for (Comment c : comments){
            CommentDto dto = c.toDto();
            if(userPrincipal != null) {
                System.out.println("userPrincipal.getUser()="+userPrincipal.getUser().toString());
                User user = userPrincipal.getUser();
                LikeStateDto likeDto = commentReactService.getLikeSatateDto(c, user);
                dto.setLiked(likeDto.isLiked());
                dto.setDisliked(likeDto.isDisliked());
                dto.setOwner(user.getId() == c.getUser().getId());
            } else{
                System.out.println("userPrincipal is null, commentId="+c.getId());
            }
            dtos.add(dto);
        }

        return ResponseEntity.ok(dtos);
    }

    @Operation(summary = "댓글 한개 조회", description = "댓글 id를 통해 댓글 하나 조회")
    @GetMapping("/{commentId}")
    public ResponseEntity<CommentDto> getCommentByIdTest(@PathVariable Long commentId){
        Comment comment = commentService.findCommentById(commentId);
        return ResponseEntity.ok(comment.toDto());
    }

    @Operation(summary = "댓글 생성")
    @PostMapping()
    public ResponseEntity createComment(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                        @PathVariable Long postId,
                                        @RequestBody RequestCommentDto dto
                                        ){
        User user = userPrincipal.getUser();
        Post post = postService.findById(postId);
        Comment comment = commentService.createComment(post, user,dto);
        URI location = URI.create("/api/posts/"+postId+"/comments/"+comment.getId());
        return ResponseEntity.created(location).build();
    }

    @Operation(summary = "댓글 수정")
    @PutMapping("/{commentId}")
    public ResponseEntity updateComment(@PathVariable Long commentId,
                                        @RequestBody RequestCommentDto dto,
                                        @AuthenticationPrincipal CustomUserPrincipal userPrincipal){
        User user = userPrincipal.getUser();
        commentService.updateComment(commentId,user.getId(),dto);
        return ResponseEntity.ok("수정 완료.");
    }
    @Operation(summary = "댓글 삭제")
    @DeleteMapping("/{commentId}")
    public ResponseEntity deleteComment(@PathVariable Long commentId,
                                        @AuthenticationPrincipal CustomUserPrincipal userPrincipal){
        User user = userPrincipal.getUser();
        commentService.deleteComment(commentId, user.getId());
        return ResponseEntity.ok("삭제 완료.");
    }

    //tests

//    @Operation(summary = "댓글 리스트 조회 테스트")
//    @GetMapping("/test/{userOd}")
//    public ResponseEntity<List<CommentDto>> getCommentsTest(@PathVariable Long postId,
//                                                            @PathVariable Long userId){
//        Post post = postService.findById(postId);
//        List<Comment> comments = commentService.getCommentsByPost(post);
//        List<CommentDto> dtos = new ArrayList<>();
//
//        for (Comment c : comments){
//            CommentDto dto = c.toDto();
//            User user = userService.findById(userId);
//            if(commentLikeService.isLikedByUser(c,user)) dto.setLiked(true);
//            else if(commentDislikeService.isDislikedByUser(c,user)) dto.setDisliked(true);
//            dtos.add(dto);
//        }
//
//        return ResponseEntity.ok(dtos);
//    }
//    @Operation(summary = "댓글 생성 테스트")
//    @PostMapping("/test/{userId}")
//    public ResponseEntity createCommentTest(@PathVariable Long postId,
//                                            @PathVariable Long userId,
//                                            @RequestBody RequestCommentDto dto){
//        User user = userService.findById(userId);
//        Post post = postService.findById(postId);
//        Comment comment = commentService.creatComment(post, user,dto);
//        if(!dto.getUrl().isEmpty()) commentMediaService.processCreateCommentMedia(user.getId(),comment,dto);
//        URI location = URI.create("/api/posts/"+postId+"/comments/"+comment.getId());
//        return ResponseEntity.created(location).build();
//    }
//
//    @Operation(summary = "댓글 수정 테스트", description = "userId를 직접 설정해 수정 테스트")
//    @PutMapping("/{commentId}/test/{userId}")
//    public ResponseEntity updateCommentTest(@PathVariable Long commentId,
//                                            @PathVariable Long userId,
//                                            @RequestBody RequestCommentDto dto){
//        commentService.updateComment(commentId,userId,dto);
//        return ResponseEntity.ok("수정 완료.");
//    }
//    @Operation(summary = "댓글 삭제 테스트")
//    @DeleteMapping("/{commentId}/test/{userId}")
//    public ResponseEntity deleteComment(@PathVariable Long commentId,
//                                        @PathVariable Long userId){
//        commentService.deleteComment(commentId, userId);
//        return ResponseEntity.ok("삭제 완료.");
//    }
}
