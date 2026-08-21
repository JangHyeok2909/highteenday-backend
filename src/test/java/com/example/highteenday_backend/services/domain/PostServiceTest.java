package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.services.domain.redisService.PostPrevCache;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PostServiceTest {

    @Mock private PostRepository postRepository;
    @Mock private BoardService boardService;
    @Mock private MediaProcessingService mediaProcessingService;
    @Mock private PostPrevCache postPrevCache;

    @InjectMocks
    private PostService postService;

    private static final Long BOARD_ID = 1L;
    private static final int SIZE = 10;

    private PostListingDto dto(int page, SortType sortType) {
        return dto(page, sortType, SIZE);
    }

    private PostListingDto dto(int page, SortType sortType, int size) {
        return PostListingDto.builder()
                .boardId(BOARD_ID).page(page).sortType(sortType).size(size)
                .build();
    }

    @Nested
    @DisplayName("getPagedPosts — 캐시 vs DB 라우팅")
    class GetPagedPosts {

        @Test
        @DisplayName("최신순 + 0페이지 → 캐시 조회")
        void recentPage0_usesCache() {
            List<PostPreviewDto> cached = List.of(PostPreviewDto.builder().id(1L).build());
            when(postPrevCache.getPostPrevs(BOARD_ID, 0, SIZE)).thenReturn(cached);

            List<PostPreviewDto> result = postService.getPagedPosts(dto(0, SortType.RECENT));

            assertThat(result).isEqualTo(cached);
            verify(postPrevCache).getPostPrevs(BOARD_ID, 0, SIZE);
            verify(postRepository, never()).findByBoard(any());
        }

        @Test
        @DisplayName("최신순 + 4페이지(마지막 캐시 페이지) → 캐시 조회")
        void recentPage4_usesCache() {
            when(postPrevCache.getPostPrevs(BOARD_ID, 4, SIZE)).thenReturn(List.of());

            postService.getPagedPosts(dto(4, SortType.RECENT));

            verify(postPrevCache).getPostPrevs(BOARD_ID, 4, SIZE);
            verify(postRepository, never()).findByBoard(any());
        }

        @Test
        @DisplayName("최신순 + 5페이지(임계값 초과) → DB 조회")
        void recentPage5_usesDb() {
            PostListingDto dto = dto(5, SortType.RECENT);
            when(postRepository.findByBoard(dto)).thenReturn(List.of());

            postService.getPagedPosts(dto);

            verify(postRepository).findByBoard(dto);
            verify(postPrevCache, never()).getPostPrevs(any(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("좋아요순 + 0페이지 → DB 조회 (정렬 타입이 RECENT 아님)")
        void likeSortPage0_usesDb() {
            PostListingDto dto = dto(0, SortType.LIKE);
            when(postRepository.findByBoard(dto)).thenReturn(List.of());

            postService.getPagedPosts(dto);

            verify(postRepository).findByBoard(dto);
            verify(postPrevCache, never()).getPostPrevs(any(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("조회수순 + 0페이지 → DB 조회 (정렬 타입이 RECENT 아님)")
        void viewSortPage0_usesDb() {
            PostListingDto dto = dto(0, SortType.VIEW);
            when(postRepository.findByBoard(dto)).thenReturn(List.of());

            postService.getPagedPosts(dto);

            verify(postRepository).findByBoard(dto);
            verify(postPrevCache, never()).getPostPrevs(any(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("최신순 + 10페이지 → DB 조회 (임계값 초과)")
        void recentPage10_usesDb() {
            PostListingDto dto = dto(10, SortType.RECENT);
            when(postRepository.findByBoard(dto)).thenReturn(List.of());

            postService.getPagedPosts(dto);

            verify(postRepository).findByBoard(dto);
            verify(postPrevCache, never()).getPostPrevs(any(), anyInt(), anyInt());
        }

        // ── KI-57: 페이지 번호가 작아도 size 가 크면 캐시 밖으로 나간다 ──
        // 캐시는 최신 50건만 담으므로 판정 기준은 page 가 아니라 (page + 1) * size 다.

        @Test
        @DisplayName("최신순 + 3페이지 · size 20 → DB 조회 (끝 인덱스 80 > 50, KI-57)")
        void recentPage3Size20_usesDb() {
            PostListingDto dto = dto(3, SortType.RECENT, 20);
            when(postRepository.findByBoard(dto)).thenReturn(List.of());

            postService.getPagedPosts(dto);

            verify(postRepository).findByBoard(dto);
            verify(postPrevCache, never()).getPostPrevs(any(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("최신순 + 2페이지 · size 20 → DB 조회 (끝 인덱스 60 > 50, 일부만 반환되던 구간)")
        void recentPage2Size20_usesDb() {
            PostListingDto dto = dto(2, SortType.RECENT, 20);
            when(postRepository.findByBoard(dto)).thenReturn(List.of());

            postService.getPagedPosts(dto);

            verify(postRepository).findByBoard(dto);
            verify(postPrevCache, never()).getPostPrevs(any(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("최신순 + 1페이지 · size 20 → 캐시 조회 (끝 인덱스 40 ≤ 50)")
        void recentPage1Size20_usesCache() {
            when(postPrevCache.getPostPrevs(BOARD_ID, 1, 20)).thenReturn(List.of());

            postService.getPagedPosts(dto(1, SortType.RECENT, 20));

            verify(postPrevCache).getPostPrevs(BOARD_ID, 1, 20);
            verify(postRepository, never()).findByBoard(any());
        }

        @Test
        @DisplayName("최신순 + 0페이지 · size 50 → 캐시 조회 (끝 인덱스 50 = 경계값)")
        void recentPage0Size50_usesCache() {
            when(postPrevCache.getPostPrevs(BOARD_ID, 0, 50)).thenReturn(List.of());

            postService.getPagedPosts(dto(0, SortType.RECENT, 50));

            verify(postPrevCache).getPostPrevs(BOARD_ID, 0, 50);
            verify(postRepository, never()).findByBoard(any());
        }

        @Test
        @DisplayName("최신순 + 1페이지 · size 50 → DB 조회 (끝 인덱스 100 > 50)")
        void recentPage1Size50_usesDb() {
            PostListingDto dto = dto(1, SortType.RECENT, 50);
            when(postRepository.findByBoard(dto)).thenReturn(List.of());

            postService.getPagedPosts(dto);

            verify(postRepository).findByBoard(dto);
            verify(postPrevCache, never()).getPostPrevs(any(), anyInt(), anyInt());
        }

        @Test
        @DisplayName("최신순 + 9페이지 · size 5 → 캐시 조회 (끝 인덱스 50 — 페이지 번호만 보던 기존 조건이면 DB로 샜다)")
        void recentPage9Size5_usesCache() {
            when(postPrevCache.getPostPrevs(BOARD_ID, 9, 5)).thenReturn(List.of());

            postService.getPagedPosts(dto(9, SortType.RECENT, 5));

            verify(postPrevCache).getPostPrevs(BOARD_ID, 9, 5);
            verify(postRepository, never()).findByBoard(any());
        }
    }

    @Nested
    @DisplayName("getPostCount")
    class GetPostCount {

        @Test
        @DisplayName("게시판 게시글 수를 캐시에서 반환한다")
        void returnsCountFromCache() {
            when(postPrevCache.getCount(BOARD_ID)).thenReturn(42L);

            Long count = postService.getPostCount(BOARD_ID);

            assertThat(count).isEqualTo(42L);
            verify(postPrevCache).getCount(BOARD_ID);
        }
    }
}
