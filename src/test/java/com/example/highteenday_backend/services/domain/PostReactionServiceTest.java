package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReaction;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.posts.PostReactionRepository;
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

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PostReactionServiceTest {

    private static final long POST_ID = 99L;

    @Mock
    private PostReactionRepository postReactionRepository;
    @Mock
    private HotPostService hotPostService;

    @InjectMocks
    private PostReactionService postReactionService;

    private Post post;
    private User user;

    @BeforeEach
    void setUp() {
        post = Post.builder().
                id(POST_ID)
                .likeCount(0)
                .dislikeCount(0)
                .build();

        user = User.builder()
                .id(1L)
                .build();

        stubCounts(0, 0);
    }

    private void stubCounts(int likes, int dislikes) {
        when(postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.LIKE)).thenReturn(likes);
        when(postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.DISLIKE)).thenReturn(dislikes);
    }

    @Nested
    @DisplayName("likeReact")
    class LikeReact {

        @Test
        @DisplayName("좋아요 상태-> 좋아요 취소, 핫스코어 갱신 x")
        void cancelsLike_withoutHotScore() {
            PostReaction like = reaction(PostReactionKind.LIKE, true);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(true);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(like));

            stubCounts(3, 1);

            postReactionService.likeReact(post, user);
            //취소시 valid=false
            assertThat(like.getIsValid()).isFalse();
            assertThat(post.getLikeCount()).isEqualTo(3);
            assertThat(post.getDislikeCount()).isEqualTo(1);
            //hotpostService의 스코어 갱신 로직 호출 확인
            verify(hotPostService, never()).updateDailyScore(any());
        }

        @Test
        @DisplayName("싫어요 상태-> 싫어요 취소하고 좋아요로 전환 + 핫스코어 갱신")
        void switchesFromDislikeToLike_updatesHotScore() {
            PostReaction row = reaction(PostReactionKind.DISLIKE, true);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(true);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(row));

            stubCounts(5, 0);

            postReactionService.likeReact(post, user);

            assertThat(row.getKind()).isEqualTo(PostReactionKind.LIKE);
            assertThat(row.getIsValid()).isTrue();
            assertThat(post.getLikeCount()).isEqualTo(5);
            assertThat(post.getDislikeCount()).isEqualTo(0);
            verify(hotPostService, times(1)).updateDailyScore(POST_ID);
        }

        @Test
        @DisplayName("반응x -> 새 좋아요를 저장 + 핫스코어 갱신")
        void createsNewLike_updatesHotScore() {
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());

            stubCounts(1, 0);

            ArgumentCaptor<PostReaction> captor = ArgumentCaptor.forClass(PostReaction.class);
            postReactionService.likeReact(post, user);

            verify(postReactionRepository).save(captor.capture());
            assertThat(captor.getValue().getKind()).isEqualTo(PostReactionKind.LIKE);
            assertThat(post.getLikeCount()).isEqualTo(1);
            verify(hotPostService, times(1)).updateDailyScore(POST_ID);
        }

        @Test
            @DisplayName("취소된 리액트-> 좋아요 재활성화 + 핫스코어 갱신")
        void reactivatesInvalidRow_updatesHotScore() {
            PostReaction softCanceled = reaction(PostReactionKind.LIKE, false);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(softCanceled));

            stubCounts(4, 0);

            postReactionService.likeReact(post, user);

            assertThat(softCanceled.getKind()).isEqualTo(PostReactionKind.LIKE);
            assertThat(softCanceled.getIsValid()).isTrue();
            verify(hotPostService, times(1)).updateDailyScore(POST_ID);
        }
    }

    @Nested
    @DisplayName("dislikeReact")
    class DislikeReact {

        @Test
        @DisplayName("싫어요 상태 -> 싫어요 취소 + 핫스코어 갱신 x")
        void cancelsDislike_withoutHotScore() {
            PostReaction dislike = reaction(PostReactionKind.DISLIKE, true);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(true);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(dislike));

            stubCounts(2, 4);

            postReactionService.dislikeReact(post, user);

            assertThat(dislike.getIsValid()).isFalse();
            assertThat(post.getLikeCount()).isEqualTo(2);
            assertThat(post.getDislikeCount()).isEqualTo(4);
            verify(hotPostService, never()).updateDailyScore(any());
        }

        @Test
        @DisplayName("좋아요 상태 -> 좋아요 취소, 싫어요로 전환 + 핫스코어를 갱신한다")
        void switchesFromLikeToDislike_updatesHotScoreOnce() {
            PostReaction row = reaction(PostReactionKind.LIKE, true);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(true);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(row));

            stubCounts(1, 2);

            postReactionService.dislikeReact(post, user);

            assertThat(row.getKind()).isEqualTo(PostReactionKind.DISLIKE);
            assertThat(row.getIsValid()).isTrue();
            assertThat(post.getLikeCount()).isEqualTo(1);
            assertThat(post.getDislikeCount()).isEqualTo(2);
            verify(hotPostService, times(1)).updateDailyScore(POST_ID);
        }

        @Test
        @DisplayName("반응x -> 새 싫어요를 저장 + 핫스코어를 갱신한다")
        void createsNewDislike_updatesHotScore() {
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());

            stubCounts(0, 1);

            ArgumentCaptor<PostReaction> captor = ArgumentCaptor.forClass(PostReaction.class);
            postReactionService.dislikeReact(post, user);

            verify(postReactionRepository).save(captor.capture());
            assertThat(captor.getValue().getKind()).isEqualTo(PostReactionKind.DISLIKE);
            verify(hotPostService, times(1)).updateDailyScore(POST_ID);
        }
    }

    @Nested
    @DisplayName("getLikeSatateDto")
    class GetLikeState {

        @Test
        @DisplayName("좋아요·싫어요 여부 + 좋아요 수 반환")
        void returnsFlagsAndLikeCount() {
            post = Post.builder().id(POST_ID).likeCount(12).dislikeCount(3).build();
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(true);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);

            LikeStateDto dto = postReactionService.getLikeSatateDto(post, user);

            assertThat(dto.getPostId()).isEqualTo(POST_ID);
            assertThat(dto.isLiked()).isTrue();
            assertThat(dto.isDisliked()).isFalse();
            assertThat(dto.getLikeCount()).isEqualTo(12);
        }
    }

    private PostReaction reaction(PostReactionKind kind, boolean valid) {
        PostReaction r = PostReaction.builder()
                .post(post)
                .user(user)
                .kind(kind)
                .build();
        if (!valid) {
            r.cancel();
        }
        return r;
    }
}
