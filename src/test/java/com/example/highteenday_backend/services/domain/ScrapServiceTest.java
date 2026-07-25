package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.scraps.ScrapRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.eventEntities.events.ScrapToggledEvent;
import com.example.highteenday_backend.services.domain.redisService.PostPrevCache;
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
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ScrapService")
class ScrapServiceTest {

    @Mock private ScrapRepository scrapRepository;
    @Mock private PostRepository postRepository;
    @Mock private PostPrevCache postPrevCache;
    @Mock private ApplicationEventPublisher eventPublisher;

    @InjectMocks private ScrapService scrapService;

    private Post post;
    private final User user = User.builder().id(2L).build();

    @BeforeEach
    void setUp() {
        post = Post.builder().id(10L).scrapCount(0).build();
        when(postRepository.findById(10L)).thenReturn(Optional.of(post));
        // 스크랩 수 재집계 전 게시글 행 잠금
        when(postRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(post));
        when(scrapRepository.countValidByPost(post)).thenReturn(1L);
    }

    @Nested
    @DisplayName("toggleScrap")
    class ToggleScrap {

        @Test
        @DisplayName("첫 스크랩 → 저장 + ScrapToggledEvent(newScrap=true) 발행")
        void firstScrapSavesAndPublishesNewScrapEvent() {
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());
            when(scrapRepository.save(any(Scrap.class))).thenAnswer(inv -> inv.getArgument(0));

            String message = scrapService.toggleScrap(10L, user);

            assertThat(message).isEqualTo("스크랩 완료.");
            verify(scrapRepository).save(any(Scrap.class));

            ArgumentCaptor<ScrapToggledEvent> eventCaptor = ArgumentCaptor.forClass(ScrapToggledEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().getPostId()).isEqualTo(10L);
            assertThat(eventCaptor.getValue().isNewScrap()).isTrue();

            verify(postPrevCache).evictPostPrev(10L);
        }

        @Test
        @DisplayName("취소된 스크랩 재활성화 → activeScrap + ScrapToggledEvent(newScrap=false)")
        void reactivatesExistingScrap() {
            Scrap existing = Scrap.builder().post(post).user(user).build();
            existing.cancelScrap();
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(existing));

            String message = scrapService.toggleScrap(10L, user);

            assertThat(message).isEqualTo("스크랩 완료.");
            assertThat(existing.getIsValid()).isTrue();
            verify(scrapRepository, never()).save(any());

            ArgumentCaptor<ScrapToggledEvent> eventCaptor = ArgumentCaptor.forClass(ScrapToggledEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().isNewScrap()).isFalse();
        }

        @Test
        @DisplayName("이미 스크랩된 상태 → cancelScrap + ScrapToggledEvent(newScrap=false)")
        void cancelsActiveScrap() {
            Scrap active = Scrap.builder().post(post).user(user).build();
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(active));

            String message = scrapService.toggleScrap(10L, user);

            assertThat(message).isEqualTo("스크랩 취소.");
            assertThat(active.getIsValid()).isFalse();

            ArgumentCaptor<ScrapToggledEvent> eventCaptor = ArgumentCaptor.forClass(ScrapToggledEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().isNewScrap()).isFalse();
        }
    }

    @Nested
    @DisplayName("isScraped")
    class IsScraped {

        @Test
        @DisplayName("유효한 스크랩이 있으면 true")
        void trueWhenValid() {
            Scrap scrap = Scrap.builder().post(post).user(user).build();
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(scrap));

            assertThat(scrapService.isScraped(post, user)).isTrue();
        }

        @Test
        @DisplayName("취소된 스크랩만 있으면 false")
        void falseWhenInvalid() {
            Scrap scrap = Scrap.builder().post(post).user(user).build();
            scrap.cancelScrap();
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(scrap));

            assertThat(scrapService.isScraped(post, user)).isFalse();
        }

        @Test
        @DisplayName("행이 없으면 false")
        void falseWhenAbsent() {
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());

            assertThat(scrapService.isScraped(post, user)).isFalse();
        }
    }

}
