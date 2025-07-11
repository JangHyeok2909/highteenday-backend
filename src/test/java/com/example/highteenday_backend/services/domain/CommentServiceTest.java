package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import jakarta.transaction.Transactional;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AutoClose;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@Transactional
public class CommentServiceTest {
    @Autowired
    private CommentService commentService;
//    @BeforeEach
//    public void setup(){
//        user = User.builder()
//                .email("test@gmail.com")
//                .nickname("tester000")
//                .name("tester000")
//                .build();
//        Board board = Board.builder()
//                .name("testBoard")
//                .build();
//
//
//        Post post = Post.builder()
//                .user(user)
//                .board(board)
//                .title("test post0")
//                .content("this is a test post")
//                .build();
//
//        comment = Comment.builder()
//                .user(user)
//                .post(post)
//                .content("test post0's comment0")
//                .s3Url(null)
//                .isAnonymous(false)
//                .build();
//    }

    @Test
    void updateCommentTest(){
        Long userId = 1L;
        Long commentId = 1L;

        String changedContent="change content.";
        String changedUrl="/test/changed-image";
        RequestCommentDto dto = RequestCommentDto.builder()
                .userId(userId) //tester1
                .content(changedContent)
                .url(changedUrl)
                .isAnonymous(true)
                .build();

        commentService.updateComment(commentId,dto);

        Comment comment = commentService.findCommentById(commentId);
        Assertions.assertThat(comment.getContent()).isEqualTo(changedContent);
        Assertions.assertThat(comment.getS3Url()).isEqualTo(changedUrl);


    }
}
