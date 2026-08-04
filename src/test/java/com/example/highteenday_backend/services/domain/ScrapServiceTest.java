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
        @DisplayName("첫 스크랩 → 저장 + ScrapToggledEvent(newScrap=true) 발행")
        void firstScrapSavesAndPublishesNewScrapEvent() {
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());
            when(scrapRepository.saveAndFlush(any(Scrap.class))).thenAnswer(inv -> inv.getArgument(0));

            String message = scrapService.toggleScrap(10L, user);

            assertThat(message).isEqualTo("스크랩 완료.");
            verify(scrapRepository).saveAndFlush(any(Scrap.class));

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
            verify(scrapRepository, never()).saveAndFlush(any());

            ArgumentCaptor<ScrapToggledEvent> eventCaptor = ArgumentCaptor.forClass(ScrapToggledEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().isNewScrap()).isFalse();
        }

        // BTL-012 회귀 테스트. 유니크 제약이 없던 시절에는 동시 토글이 중복 행을 만들었고,
        // 그 뒤로 해당 게시글은 isScraped()의 NonUniqueResultException 때문에 상세 조회가
        // 영구히 막혔다. 이제 DB가 INSERT를 거부하므로 먼저 저장된 행을 살려 쓴다.
        @Test
        @DisplayName("동시 토글로 UNIQUE 제약에 걸리면 먼저 저장된 행을 활성화한다")
        void recoversFromConcurrentInsert() {
            Scrap winner = Scrap.builder().post(post).user(user).build();
            winner.cancelScrap();

            when(scrapRepository.findByPostAndUser(post, user))
                    .thenReturn(Optional.empty())   // 최초 조회 — 아직 없다
                    .thenReturn(Optional.of(winner)); // 충돌 후 재조회 — 경쟁 요청이 만들어 둔 행
            when(scrapRepository.saveAndFlush(any(Scrap.class)))
                    .thenThrow(new DataIntegrityViolationException("uk_scraps_usr_pst"));

            String message = scrapService.toggleScrap(10L, user);

            assertThat(message).isEqualTo("스크랩 완료.");
            assertThat(winner.getIsValid()).isTrue();

            // 카운트 동기화와 캐시 무효화는 충돌 여부와 무관하게 수행돼야 한다.
            verify(postPrevCache).evictPostPrev(10L);

            // 먼저 성공한 요청이 이미 발행했으므로 newScrap=false 로 나가야 한다.
            ArgumentCaptor<ScrapToggledEvent> eventCaptor = ArgumentCaptor.forClass(ScrapToggledEvent.class);
            verify(eventPublisher).publishEvent(eventCaptor.capture());
            assertThat(eventCaptor.getValue().isNewScrap()).isFalse();
        }

        @Test
        @DisplayName("UNIQUE 충돌 후 재조회도 비면 데이터 무결성 오류를 던진다")
        void throwsWhenConflictRowVanishes() {
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());
            when(scrapRepository.saveAndFlush(any(Scrap.class)))
                    .thenThrow(new DataIntegrityViolationException("uk_scraps_usr_pst"));

            assertThatThrownBy(() -> scrapService.toggleScrap(10L, user))
                    .isInstanceOf(CustomException.class);

            verify(eventPublisher, never()).publishEvent(any(ScrapToggledEvent.class));
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
