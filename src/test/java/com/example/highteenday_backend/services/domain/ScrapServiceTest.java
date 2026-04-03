package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.scraps.ScrapRepository;
import com.example.highteenday_backend.domain.users.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("ScrapService")
class ScrapServiceTest {

    @Mock
    private ScrapRepository scrapRepository;
    @Mock
    private HotPostService hotPostService;

    @InjectMocks
    private ScrapService scrapService;

    private final Post post = Post.builder().id(10L).build();
    private final User user = User.builder().id(2L).build();

    @Nested
    @DisplayName("createScrap")
    class CreateScrap {

        @Test
        @DisplayName("첫 스크랩이면 저장 후 일간 핫스코어를 갱신한다")
        void savesAndUpdatesHotScoreWhenNew() {
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.empty());
            when(scrapRepository.save(any(Scrap.class))).thenAnswer(inv -> inv.getArgument(0));

            scrapService.createScrap(post, user);

            verify(hotPostService).updateDailyScore(10L);
            ArgumentCaptor<Scrap> captor = ArgumentCaptor.forClass(Scrap.class);
            verify(scrapRepository).save(captor.capture());
            assertThat(captor.getValue().getPost()).isEqualTo(post);
            assertThat(captor.getValue().getUser()).isEqualTo(user);
        }

        @Test
        @DisplayName("이미 행이 있으면 재활성만 하고 핫스코어는 호출하지 않는다")
        void reactivatesWithoutHotScoreWhenRowExists() {
            Scrap existing = Scrap.builder().post(post).user(user).build();
            existing.cancelScrap();
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(existing));

            Scrap result = scrapService.createScrap(post, user);

            assertThat(result).isSameAs(existing);
            assertThat(existing.getIsValid()).isTrue();
            verify(scrapRepository, never()).save(any());
            verify(hotPostService, never()).updateDailyScore(org.mockito.ArgumentMatchers.anyLong());
        }
    }

    @Nested
    @DisplayName("cancelScrap")
    class CancelScrap {

        @Test
        @DisplayName("스크랩이 있으면 비활성화한다")
        void cancelsWhenPresent() {
            Scrap scrap = Scrap.builder().post(post).user(user).build();
            when(scrapRepository.findByPostAndUser(post, user)).thenReturn(Optional.of(scrap));

            scrapService.cancelScrap(post, user);

            assertThat(scrap.getIsValid()).isFalse();
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
            Scrap s1 = org.mockito.Mockito.mock(Scrap.class);
            Scrap s2 = org.mockito.Mockito.mock(Scrap.class);
            when(s1.getCreated()).thenReturn(older);
            when(s2.getCreated()).thenReturn(newer);
            List<Scrap> list = new ArrayList<>(List.of(s1, s2));
            when(scrapRepository.findByUser(user)).thenReturn(list);

            List<Scrap> out = scrapService.getRecentScrapsByUser(user);

            assertThat(out).containsExactly(s2, s1);
        }
    }
}
