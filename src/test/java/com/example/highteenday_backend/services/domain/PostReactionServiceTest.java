package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReaction;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.posts.PostReactionRepository;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.eventEntities.events.PostReactedEvent;
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
import org.springframework.context.ApplicationEventPublisher;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PostReactionServiceTest {

    private static final long POST_ID = 99L;

    @Mock
    private PostReactionRepository postReactionRepository;
    @Mock
    private PostRepository postRepository;
    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private PostReactionService postReactionService;

    private Post post;
    private User user;

    @BeforeEach
    void setUp() {
        post = Post.builder()
                .id(POST_ID)
                .likeCount(0)
                .dislikeCount(0)
                .build();

        user = User.builder()
                .id(1L)
                .build();

        when(postRepository.findByIdForUpdate(POST_ID)).thenReturn(Optional.of(post));
        stubCounts(0, 0);
    }

    @Test
    @DisplayName("반응 처리는 카운터를 재집계하기 전에 게시글 행을 잠근다")
    void locksPostBeforeRecounting() {
        when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());

        postReactionService.likeReact(post, user);

        // 잠금이 COUNT 뒤로 밀리면 동시 요청 사이에서 갱신 손실이 다시 발생한다.
        InOrder inOrder = inOrder(postRepository, postReactionRepository);
        inOrder.verify(postRepository).findByIdForUpdate(POST_ID);
        inOrder.verify(postReactionRepository).countByPostAndKindAndIsValidTrue(post, PostReactionKind.LIKE);
    }

    @Test
    @DisplayName("존재하지 않는 게시글이면 잠금 단계에서 실패한다")
    void failsWhenPostDisappeared() {
        when(postRepository.findByIdForUpdate(POST_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> postReactionService.likeReact(post, user))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(postReactionRepository, never()).save(any());
    }

    private void stubCounts(int likes, int dislikes) {
        when(postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.LIKE)).thenReturn(likes);
        when(postReactionRepository.countByPostAndKindAndIsValidTrue(post, PostReactionKind.DISLIKE)).thenReturn(dislikes);
    }

    @Nested
    @DisplayName("likeReact")
    class LikeReact {

        @Test
        @DisplayName("좋아요 상태 → 좋아요 취소, 이벤트 발행 없음")
        void cancelsLike_withoutEvent() {
            PostReaction like = reaction(PostReactionKind.LIKE, true);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(true);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(like));

            stubCounts(3, 1);

            postReactionService.likeReact(post, user);

            assertThat(like.getIsValid()).isFalse();
            assertThat(post.getLikeCount()).isEqualTo(3);
            assertThat(post.getDislikeCount()).isEqualTo(1);
            verify(eventPublisher, never()).publishEvent(any());
        }

        @Test
        @DisplayName("싫어요 상태 → 좋아요 전환 + PostReactedEvent 발행")
        void switchesFromDislikeToLike_publishesEvent() {
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

            ArgumentCaptor<PostReactedEvent> captor = ArgumentCaptor.forClass(PostReactedEvent.class);
            verify(eventPublisher).publishEvent(captor.capture());
            assertThat(captor.getValue().getPostId()).isEqualTo(POST_ID);
        }

        @Test
        @DisplayName("반응 없음 → 새 좋아요 저장 + PostReactedEvent 발행")
        void createsNewLike_publishesEvent() {
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());

            stubCounts(1, 0);

            postReactionService.likeReact(post, user);

            ArgumentCaptor<PostReaction> saveCaptor = ArgumentCaptor.forClass(PostReaction.class);
            verify(postReactionRepository).save(saveCaptor.capture());
            assertThat(saveCaptor.getValue().getKind()).isEqualTo(PostReactionKind.LIKE);
            assertThat(post.getLikeCount()).isEqualTo(1);

            ArgumentCaptor<PostReactedEvent> eventCaptor = ArgumentCaptor.forClass(PostReactedEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().getPostId()).isEqualTo(POST_ID);
        }

        @Test
        @DisplayName("취소된 리액션 → 좋아요 재활성화 + PostReactedEvent 발행")
        void reactivatesInvalidRow_publishesEvent() {
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
            verify(eventPublisher).publishEvent(any(PostReactedEvent.class));
        }
    }

    @Nested
    @DisplayName("dislikeReact")
    class DislikeReact {

        @Test
        @DisplayName("싫어요 상태 → 싫어요 취소, 이벤트 발행 없음")
        void cancelsDislike_withoutEvent() {
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
            verify(eventPublisher, never()).publishEvent(any());
        }

        @Test
        @DisplayName("좋아요 상태 → 싫어요 전환 + PostReactedEvent 발행")
        void switchesFromLikeToDislike_publishesEvent() {
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
            verify(eventPublisher).publishEvent(any(PostReactedEvent.class));
        }

        @Test
        @DisplayName("반응 없음 → 새 싫어요 저장 + PostReactedEvent 발행")
        void createsNewDislike_publishesEvent() {
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.LIKE))
                    .thenReturn(false);
            when(postReactionRepository.existsByPostAndUserAndKindAndIsValidTrue(post, user, PostReactionKind.DISLIKE))
                    .thenReturn(false);
            when(postReactionRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());

            stubCounts(0, 1);

            postReactionService.dislikeReact(post, user);

            ArgumentCaptor<PostReaction> captor = ArgumentCaptor.forClass(PostReaction.class);
            verify(postReactionRepository).save(captor.capture());
            assertThat(captor.getValue().getKind()).isEqualTo(PostReactionKind.DISLIKE);
            verify(eventPublisher).publishEvent(any(PostReactedEvent.class));
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
