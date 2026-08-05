package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.scraps.ScrapRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.eventEntities.events.ScrapToggledEvent;
import com.example.highteenday_backend.exceptions.CustomException;
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
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
        when(scrapRepository.countValidByPost(post)).thenReturn(1L);
    }

    @Nested
    @DisplayName("toggleScrap")
    class ToggleScrap {

        @Test
        @DisplayName("첫 스크랩 → upsert가 INSERT(1행) + ScrapToggledEvent(newScrap=true) 발행")
        void firstScrapInsertsAndPublishesNewScrapEvent() {
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());
            when(scrapRepository.upsertActive(2L, 10L)).thenReturn(1); // MySQL: 1 = INSERT

            String message = scrapService.toggleScrap(10L, user);

            assertThat(message).isEqualTo("스크랩 완료.");
            verify(scrapRepository).upsertActive(2L, 10L);

            ArgumentCaptor<ScrapToggledEvent> eventCaptor = ArgumentCaptor.forClass(ScrapToggledEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().getPostId()).isEqualTo(10L);
            assertThat(eventCaptor.getValue().isNewScrap()).isTrue();

            verify(postPrevCache).evictPostPrev(10L);
        }

        @Test
        @DisplayName("취소된 스크랩 재활성화 → upsert가 UPDATE(2행) + ScrapToggledEvent(newScrap=false)")
        void reactivatesExistingScrap() {
            Scrap existing = Scrap.builder().post(post).user(user).build();
            existing.cancelScrap();
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(existing));
            when(scrapRepository.upsertActive(2L, 10L)).thenReturn(2); // MySQL: 2 = 기존 행 갱신

            String message = scrapService.toggleScrap(10L, user);

            assertThat(message).isEqualTo("스크랩 완료.");

            ArgumentCaptor<ScrapToggledEvent> eventCaptor = ArgumentCaptor.forClass(ScrapToggledEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().isNewScrap()).isFalse();
        }

        // BTL-012 회귀 테스트.
        //
        // 조회 시점에는 행이 없었는데 upsert 가 갱신(2행)을 보고하는 상황 = 그 사이에 다른
        // 요청이 같은 행을 만들었다는 뜻이다. 예전에는 이 경로에서 INSERT 가 UNIQUE 제약에
        // 걸렸고, 그 예외를 잡아 같은 트랜잭션에서 복구하려 했지만 JPA 에서는 성립하지 않는다
        // (flush 실패 후 영속성 컨텍스트는 못 쓴다). upsert 는 충돌 자체를 만들지 않는다.
        //
        // 이벤트는 먼저 성공한 요청이 이미 발행했으므로 여기서는 newScrap=false 여야 한다.
        @Test
        @DisplayName("경쟁 요청이 먼저 만들었으면 upsert가 갱신으로 끝나고 newScrap=false")
        void concurrentInsertResolvesAsUpdate() {
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());
            when(scrapRepository.upsertActive(2L, 10L)).thenReturn(2);

            String message = scrapService.toggleScrap(10L, user);

            assertThat(message).isEqualTo("스크랩 완료.");
            verify(postPrevCache).evictPostPrev(10L);

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

    @Nested
    @DisplayName("getRecentScrapsByUser")
    class RecentScraps {

        @Test
        @DisplayName("생성 시각 내림차순으로 정렬한다")
        void sortsByCreatedDescending() {
            LocalDateTime older = LocalDateTime.of(2024, 1, 1, 10, 0);
            LocalDateTime newer = LocalDateTime.of(2024, 6, 1, 10, 0);
            Scrap s1 = mock(Scrap.class);
            Scrap s2 = mock(Scrap.class);
            when(s1.getCreated()).thenReturn(older);
            when(s2.getCreated()).thenReturn(newer);
            List<Scrap> list = new ArrayList<>(List.of(s1, s2));
            when(scrapRepository.findByUser(user)).thenReturn(list);

            List<Scrap> out = scrapService.getRecentScrapsByUser(user);

            assertThat(out).containsExactly(s2, s1);
        }
    }
}
