package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentReaction;
import com.example.highteenday_backend.domain.comments.CommentReactionRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.ReactionKind;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CommentReactionServiceTest {

    private static final long COMMENT_ID = 42L;

    @Mock
    private CommentReactionRepository commentReactionRepository;

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
        stubCounts(0, 0);
    }

    private void stubCounts(int likes, int dislikes) {
        when(commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, ReactionKind.LIKE)).thenReturn(likes);
        when(commentReactionRepository.countByCommentAndKindAndIsValidTrue(comment, ReactionKind.DISLIKE)).thenReturn(dislikes);
    }

    @Nested
    @DisplayName("likeReact")
    class LikeReact {

        @Test
        @DisplayName("좋아요 상태 -> 취소")
        void cancelsLike() {
            CommentReaction like = reaction(ReactionKind.LIKE, true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.LIKE))
                    .thenReturn(true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.DISLIKE))
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
            CommentReaction row = reaction(ReactionKind.DISLIKE, true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.LIKE))
                    .thenReturn(false);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.DISLIKE))
                    .thenReturn(true);
            when(commentReactionRepository.findByCommentAndUser(comment, user)).thenReturn(Optional.of(row));

            stubCounts(3, 0);

            commentReactionService.likeReact(comment, user);

            assertThat(row.getKind()).isEqualTo(ReactionKind.LIKE);
            assertThat(row.getIsValid()).isTrue();
        }

        @Test
        @DisplayName("반응x -> 새 좋아요 저장")
        void createsNewLike() {
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.LIKE))
                    .thenReturn(false);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.DISLIKE))
                    .thenReturn(false);
            when(commentReactionRepository.findByCommentAndUser(comment, user)).thenReturn(Optional.empty());

            stubCounts(1, 0);

            ArgumentCaptor<CommentReaction> captor = ArgumentCaptor.forClass(CommentReaction.class);
            commentReactionService.likeReact(comment, user);

            verify(commentReactionRepository).save(captor.capture());
            assertThat(captor.getValue().getKind()).isEqualTo(ReactionKind.LIKE);
        }
    }

    @Nested
    @DisplayName("dislikeReact")
    class DislikeReact {

        @Test
        @DisplayName("싫어요 상태 -> 취소")
        void cancelsDislike() {
            CommentReaction dislike = reaction(ReactionKind.DISLIKE, true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.LIKE))
                    .thenReturn(false);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.DISLIKE))
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
            CommentReaction row = reaction(ReactionKind.LIKE, true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.LIKE))
                    .thenReturn(true);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.DISLIKE))
                    .thenReturn(false);
            when(commentReactionRepository.findByCommentAndUser(comment, user)).thenReturn(Optional.of(row));

            stubCounts(0, 1);

            commentReactionService.dislikeReact(comment, user);

            assertThat(row.getKind()).isEqualTo(ReactionKind.DISLIKE);
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
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.LIKE))
                    .thenReturn(false);
            when(commentReactionRepository.existsByCommentAndUserAndKindAndIsValidTrue(comment, user, ReactionKind.DISLIKE))
                    .thenReturn(true);

            LikeStateDto dto = commentReactionService.getLikeStateDto(comment, user);

            assertThat(dto.getCommentId()).isEqualTo(COMMENT_ID);
            assertThat(dto.isLiked()).isFalse();
            assertThat(dto.isDisliked()).isTrue();
            assertThat(dto.getLikeCount()).isEqualTo(5);
            assertThat(dto.getDislikeCount()).isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("findMyReactions")
    class FindMyReactions {

        /**
         * 이 메서드의 존재 이유는 조회 횟수다. 댓글마다 좋아요·싫어요를 따로 물으면 2N 번
         * 나가던 것을 1번으로 줄인 것이라, "결과가 맞다"만큼 "조회를 한 번만 한다"가 계약이다.
         */
        @Test
        @DisplayName("댓글이 몇 개든 조회는 한 번만 한다")
        void queriesOnce() {
            List<Comment> comments = commentsWithIds(1L, 2L, 3L, 4L, 5L);
            when(commentReactionRepository.findMineByCommentIds(eq(user), anyCollection()))
                    .thenReturn(List.of());

            commentReactionService.findMyReactions(comments, user);

            verify(commentReactionRepository, times(1)).findMineByCommentIds(eq(user), anyCollection());
            verify(commentReactionRepository, never())
                    .existsByCommentAndUserAndKindAndIsValidTrue(any(), any(), any());
        }

        @Test
        @DisplayName("목록에 있는 댓글 id 전부를 한 번에 넘긴다")
        void passesEveryCommentId() {
            List<Comment> comments = commentsWithIds(7L, 8L, 9L);
            when(commentReactionRepository.findMineByCommentIds(eq(user), anyCollection()))
                    .thenReturn(List.of());

            commentReactionService.findMyReactions(comments, user);

            ArgumentCaptor<Collection<Long>> captor = ArgumentCaptor.forClass(Collection.class);
            verify(commentReactionRepository).findMineByCommentIds(eq(user), captor.capture());
            assertThat(captor.getValue()).containsExactly(7L, 8L, 9L);
        }

        @Test
        @DisplayName("반응 종류를 댓글 id 로 찾을 수 있게 돌려준다")
        void mapsKindByCommentId() {
            List<Comment> comments = commentsWithIds(1L, 2L, 3L);
            when(commentReactionRepository.findMineByCommentIds(eq(user), anyCollection()))
                    .thenReturn(List.of(
                            reactionOn(comments.get(0), ReactionKind.LIKE),
                            reactionOn(comments.get(2), ReactionKind.DISLIKE)));

            Map<Long, ReactionKind> result = commentReactionService.findMyReactions(comments, user);

            assertThat(result).containsEntry(1L, ReactionKind.LIKE);
            assertThat(result).containsEntry(3L, ReactionKind.DISLIKE);
        }

        @Test
        @DisplayName("반응이 없는 댓글은 맵에 없다")
        void omitsCommentsWithoutReaction() {
            // 호출부는 `kind == LIKE` 로 읽는다. 없는 키가 null 이면 그 비교가 그대로
            // false 라, "반응 없음"을 나타내는 별도 값을 만들 이유가 없다.
            List<Comment> comments = commentsWithIds(1L, 2L);
            when(commentReactionRepository.findMineByCommentIds(eq(user), anyCollection()))
                    .thenReturn(List.of(reactionOn(comments.get(0), ReactionKind.LIKE)));

            Map<Long, ReactionKind> result = commentReactionService.findMyReactions(comments, user);

            assertThat(result).doesNotContainKey(2L);
            assertThat(result.get(2L)).isNull();
        }

        @Test
        @DisplayName("댓글이 없으면 조회하지 않는다")
        void skipsQueryWhenNoComments() {
            Map<Long, ReactionKind> result = commentReactionService.findMyReactions(List.of(), user);

            assertThat(result).isEmpty();
            verify(commentReactionRepository, never()).findMineByCommentIds(any(), anyCollection());
        }
    }

    private List<Comment> commentsWithIds(Long... ids) {
        return Arrays.stream(ids)
                .map(id -> Comment.builder().id(id).post(dummyPost).build())
                .toList();
    }

    private CommentReaction reactionOn(Comment target, ReactionKind kind) {
        return CommentReaction.builder().comment(target).user(user).kind(kind).build();
    }

    private CommentReaction reaction(ReactionKind kind, boolean valid) {
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
