package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentReaction;
import com.example.highteenday_backend.domain.comments.CommentReactionRepository;
import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CommentReactionServiceTest {

    private static final long COMMENT_ID = 42L;

    @Mock
    private CommentReactionRepository commentReactionRepository;
    @Mock
    private CommentRepository commentRepository;

    @InjectMocks
    private CommentReactionService commentReactionService;

    private Comment comment;
    private User user;
    private Post dummyPost;

    @BeforeEach
    void setUp() {
        dummyPost = Post.builder().id(1L).build();
        comment = Comment.builder().id(COMMENT_ID).post(dummyPost).likeCount(0).dislikeCount(0).build();
        user = User.builder().id(1L).build();
        when(commentRepository.findByIdForUpdate(COMMENT_ID)).thenReturn(Optional.of(comment));
        stubCounts(0, 0);
    }

    @Test
    @DisplayName("반응 처리는 카운터를 재집계하기 전에 댓글 행을 잠근다")
    void locksCommentBeforeRecounting() {
        when(commentReactionRepository.findByCommentAndUser(comment, user)).thenReturn(Optional.empty());

        commentReactionService.likeReact(comment, user);

        // 잠금이 COUNT 뒤로 밀리면 동시 요청 사이에서 갱신 손실이 다시 발생한다.
        InOrder inOrder = inOrder(commentRepository, commentReactionRepository);
        inOrder.verify(commentRepository).findByIdForUpdate(COMMENT_ID);
        inOrder.verify(commentReactionRepository).countByCommentAndKindAndIsValidTrue(comment, PostReactionKind.LIKE);
    }

    @Test
    @DisplayName("존재하지 않는 댓글이면 잠금 단계에서 실패한다")
    void failsWhenCommentDisappeared() {
        when(commentRepository.findByIdForUpdate(COMMENT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> commentReactionService.likeReact(comment, user))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(commentReactionRepository, never()).save(any());
    }

    private void stubCounts(int likes, int dislikes) {
        when(commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, PostReactionKind.LIKE)).thenReturn(likes);
        when(commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, PostReactionKind.DISLIKE)).thenReturn(dislikes);
    }

    @Nested
    @DisplayName("likeReact")
    class LikeReact {

        @Test
        @DisplayName("좋아요 상태 -> 취소")
        void cancelsLike() {
            CommentReaction like = reaction(PostReactionKind.LIKE, true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.LIKE))
                    .thenReturn(true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(commentReactionRepository.findByCommentAndUser(comment, user)).thenReturn(Optional.of(like));

            stubCounts(2, 0);

            commentReactionService.likeReact(comment, user);

            assertThat(like.getIsValid()).isFalse();
            assertThat(comment.getLikeCount()).isEqualTo(2);
            assertThat(comment.getDislikeCount()).isEqualTo(0);
        }

        @Test
        @DisplayName("싫어요 상태 -> 좋아요 전환")
        void switchesFromDislikeToLike() {
            CommentReaction row = reaction(PostReactionKind.DISLIKE, true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.DISLIKE))
                    .thenReturn(true);
            when(commentReactionRepository.findByCommentAndUser(comment, user)).thenReturn(Optional.of(row));

            stubCounts(3, 0);

            commentReactionService.likeReact(comment, user);

            assertThat(row.getKind()).isEqualTo(PostReactionKind.LIKE);
            assertThat(row.getIsValid()).isTrue();
        }

        @Test
        @DisplayName("반응x -> 새 좋아요 저장")
        void createsNewLike() {
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(commentReactionRepository.findByCommentAndUser(comment, user)).thenReturn(Optional.empty());

            stubCounts(1, 0);

            ArgumentCaptor<CommentReaction> captor = ArgumentCaptor.forClass(CommentReaction.class);
            commentReactionService.likeReact(comment, user);

            verify(commentReactionRepository).save(captor.capture());
            assertThat(captor.getValue().getKind()).isEqualTo(PostReactionKind.LIKE);
        }
    }

    @Nested
    @DisplayName("dislikeReact")
    class DislikeReact {

        @Test
        @DisplayName("싫어요 상태 -> 취소")
        void cancelsDislike() {
            CommentReaction dislike = reaction(PostReactionKind.DISLIKE, true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.DISLIKE))
                    .thenReturn(true);
            when(commentReactionRepository.findByCommentAndUser(comment, user)).thenReturn(Optional.of(dislike));

            stubCounts(0, 1);

            commentReactionService.dislikeReact(comment, user);

            assertThat(dislike.getIsValid()).isFalse();
            assertThat(comment.getDislikeCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("좋아요 상태 -> 싫어요 전환")
        void switchesFromLikeToDislike() {
            CommentReaction row = reaction(PostReactionKind.LIKE, true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.LIKE))
                    .thenReturn(true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(commentReactionRepository.findByCommentAndUser(comment, user)).thenReturn(Optional.of(row));

            stubCounts(0, 1);

            commentReactionService.dislikeReact(comment, user);

            assertThat(row.getKind()).isEqualTo(PostReactionKind.DISLIKE);
            assertThat(row.getIsValid()).isTrue();
        }
    }

    @Nested
    @DisplayName("getLikeSatateDto")
    class GetLikeState {

        @Test
        @DisplayName("댓글 id, 좋아요·싫어요 여부, 카운트를 반환")
        void returnsCommentState() {
            comment = Comment.builder().id(COMMENT_ID).post(dummyPost).likeCount(5).dislikeCount(2).build();
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, PostReactionKind.DISLIKE))
                    .thenReturn(true);

            LikeStateDto dto = commentReactionService.getLikeSatateDto(comment, user);

            assertThat(dto.getCommentId()).isEqualTo(COMMENT_ID);
            assertThat(dto.isLiked()).isFalse();
            assertThat(dto.isDisliked()).isTrue();
            assertThat(dto.getLikeCount()).isEqualTo(5);
            assertThat(dto.getDislikeCount()).isEqualTo(2);
        }
    }

    private CommentReaction reaction(PostReactionKind kind, boolean valid) {
        CommentReaction r = CommentReaction.builder()
                .comment(comment)
                .user(user)
                .kind(kind)
                .build();
        if (!valid) {
            r.cancel();
        }
        return r;
    }
}
