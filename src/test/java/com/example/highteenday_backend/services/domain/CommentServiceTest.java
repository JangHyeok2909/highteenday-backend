package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CommentServiceTest {

    @Mock private CommentRepository commentRepository;
    @Mock private PostRepository postRepository;
    @Mock private MediaProcessingService mediaProcessingService;
    @Mock private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private CommentService commentService;

    private static final Long AUTHOR_ID = 1L;
    private static final Long STRANGER_ID = 2L;
    private static final Long COMMENT_ID = 100L;
    private static final Long POST_ID = 10L;

    private Comment comment;

    @BeforeEach
    void setUp() {
        User author = User.builder().id(AUTHOR_ID).build();
        Post post = Post.builder().id(POST_ID).user(author).commentCount(3).build();
        comment = Comment.builder().id(COMMENT_ID).user(author).post(post).content("원본 내용").build();

        when(commentRepository.findById(COMMENT_ID)).thenReturn(Optional.of(comment));
    }

    @Nested
    @DisplayName("updateComment — 작성자 검증")
    class UpdateComment {

        @Test
        @DisplayName("작성자 본인이면 내용이 수정된다")
        void authorCanUpdate() {
            commentService.updateComment(COMMENT_ID, AUTHOR_ID, dto("수정된 내용"));

            assertThat(comment.getContent()).isEqualTo("수정된 내용");
            assertThat(comment.getUpdatedBy()).isEqualTo(AUTHOR_ID);
        }

        @Test
        @DisplayName("작성자가 아니면 NO_ACCESS로 거부하고 내용을 바꾸지 않는다")
        void strangerCannotUpdate() {
            assertThatThrownBy(() -> commentService.updateComment(COMMENT_ID, STRANGER_ID, dto("변조 시도")))
                    .isInstanceOf(CustomException.class)
                    .extracting(e -> ((CustomException) e).getErrorCode())
                    .isEqualTo(ErrorCode.NO_ACCESS);

            assertThat(comment.getContent()).isEqualTo("원본 내용");
            verifyNoInteractions(mediaProcessingService);
        }
    }

    @Nested
    @DisplayName("deleteComment — 작성자 검증")
    class DeleteComment {

        @Test
        @DisplayName("작성자 본인이면 삭제되고 게시글 댓글 수가 원자적으로 감소한다")
        void authorCanDelete() {
            commentService.deleteComment(COMMENT_ID, AUTHOR_ID);

            assertThat(comment.getIsValid()).isFalse();
            // 엔티티에서 읽어 빼면 동시 삭제 시 갱신이 유실되므로 DB에서 직접 감소시킨다.
            verify(postRepository).decrementCommentCount(POST_ID);
        }

        @Test
        @DisplayName("작성자가 아니면 NO_ACCESS로 거부하고 삭제하지 않는다")
        void strangerCannotDelete() {
            assertThatThrownBy(() -> commentService.deleteComment(COMMENT_ID, STRANGER_ID))
                    .isInstanceOf(CustomException.class)
                    .extracting(e -> ((CustomException) e).getErrorCode())
                    .isEqualTo(ErrorCode.NO_ACCESS);

            assertThat(comment.getIsValid()).isTrue();
            verify(postRepository, never()).decrementCommentCount(any());
        }
    }

    private RequestCommentDto dto(String content) {
        return RequestCommentDto.builder().content(content).build();
    }
}
