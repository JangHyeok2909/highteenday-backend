package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.UpdatePostDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.services.global.AfterCommitExecutor;
import com.example.highteenday_backend.support.TestPrincipals;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.services.domain.redisService.PostPrevCache;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PostServiceTest {

    @Mock private PostRepository postRepository;
    @Mock private BoardService boardService;
    @Mock private MediaProcessingService mediaProcessingService;
    @Mock private PostPrevCache postPrevCache;
    @Mock private AfterCommitExecutor afterCommitExecutor;

    @InjectMocks
    private PostService postService;

    /**
     * 기본값은 "커밋됐다" — 예약된 작업을 즉시 실행한다.
     * 커밋 전/후를 구분해야 하는 테스트만 이 스텁을 덮어쓴다.
     */
    @BeforeEach
    void runDeferredActionsImmediately() {
        lenient().doAnswer(invocation -> {
            invocation.getArgument(0, Runnable.class).run();
            return null;
        }).when(afterCommitExecutor).run(any(Runnable.class));
    }

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

    /**
     * IDOR 회귀 방지 (docs/KNOWN-ISSUES.md KI-05).
     * 검증이 빠지면 "남의 글이 수정/삭제된다"가 되므로, 아래 두 테스트는
     * 소유권 검사를 지우는 순간 실패한다.
     */
    @Nested
    @DisplayName("소유권 검증 — 남의 글은 손댈 수 없다")
    class Ownership {

        private static final Long OWNER_ID = 1L;
        private static final Long STRANGER_ID = 999L;
        private static final Long POST_ID = 7L;

        private Post ownedPost() {
            User owner = TestPrincipals.user(OWNER_ID);
            Board board = Board.builder().id(BOARD_ID).name("자유게시판").build();
            return Post.create(owner, board, "원래 제목", "원래 내용", false);
        }

        @Test
        @DisplayName("남의 글 수정은 403 이고 내용이 바뀌지 않는다")
        void updateByStrangerIsForbidden() {
            Post post = ownedPost();
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));

            UpdatePostDto dto = UpdatePostDto.builder().title("탈취").content("탈취").build();

            assertThatThrownBy(() -> postService.updatePost(POST_ID, STRANGER_ID, dto))
                    .isInstanceOf(CustomException.class)
                    .extracting(e -> ((CustomException) e).getErrorCode())
                    .isEqualTo(ErrorCode.NO_ACCESS);

            assertThat(post.getTitle()).isEqualTo("원래 제목");
            verify(mediaProcessingService, never())
                    .processUpdatePostMedia(any(), any(), any(), any());
        }

        @Test
        @DisplayName("남의 글 삭제는 403 이고 삭제 표시도 캐시 무효화도 일어나지 않는다")
        void deleteByStrangerIsForbidden() {
            Post post = ownedPost();
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));

            assertThatThrownBy(() -> postService.deletePost(POST_ID, STRANGER_ID))
                    .isInstanceOf(CustomException.class)
                    .extracting(e -> ((CustomException) e).getErrorCode())
                    .isEqualTo(ErrorCode.NO_ACCESS);

            assertThat(post.getIsValid()).isTrue();
            verify(postPrevCache, never()).evictBoard(any());
            verify(postPrevCache, never()).decrementBoardCount(any());
        }

        @Test
        @DisplayName("작성자 본인의 삭제는 통과한다")
        void deleteByOwnerSucceeds() {
            Post post = ownedPost();
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));

            postService.deletePost(POST_ID, OWNER_ID);

            assertThat(post.getIsValid()).isFalse();
            verify(postPrevCache).evictBoard(BOARD_ID);
        }
    }

    /**
     * 캐시 갱신 시점 회귀 방지 (docs/KNOWN-ISSUES.md KI-22).
     *
     * 여기서는 예약된 작업을 <b>일부러 실행하지 않는다.</b> 커밋 전에 캐시를 건드리면
     * 롤백 시 존재하지 않는 글이 목록 캐시에 남으므로, "메서드가 끝난 시점까지도
     * 캐시가 그대로여야 한다"가 고정할 내용이다.
     */
    @Nested
    @DisplayName("캐시 갱신은 커밋 이후에만 일어난다 (KI-22)")
    class CacheAfterCommit {

        private static final Long POST_ID = 7L;
        private static final Long OWNER_ID = 1L;

        @BeforeEach
        void doNotRunDeferredActions() {
            // 예약만 받고 실행하지 않는다 = 아직 커밋되지 않은 상태.
            doNothing().when(afterCommitExecutor).run(any(Runnable.class));
        }

        private Post ownedPost() {
            User owner = TestPrincipals.user(OWNER_ID);
            Board board = Board.builder().id(BOARD_ID).name("자유게시판").build();
            return Post.create(owner, board, "제목", "내용", false);
        }

        @Test
        @DisplayName("생성: 커밋 전에는 목록 캐시도 카운트도 건드리지 않는다")
        void createDoesNotTouchCacheBeforeCommit() {
            Board board = Board.builder().id(BOARD_ID).name("자유게시판").build();
            User author = TestPrincipals.user(OWNER_ID);
            when(boardService.findById(BOARD_ID)).thenReturn(board);
            when(postRepository.save(any(Post.class))).thenAnswer(inv -> inv.getArgument(0));

            postService.createPost(author, RequestPostDto.builder()
                    .boardId(BOARD_ID).title("제목").content("내용").build());

            verify(afterCommitExecutor).run(any(Runnable.class));
            verify(postPrevCache, never()).evictBoard(any());
            verify(postPrevCache, never()).cachePostPrev(any());
            verify(postPrevCache, never()).incrementBoardCount(any());
        }

        @Test
        @DisplayName("삭제: 커밋 전에는 캐시 무효화도 카운트 감소도 하지 않는다")
        void deleteDoesNotTouchCacheBeforeCommit() {
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(ownedPost()));

            postService.deletePost(POST_ID, OWNER_ID);

            verify(afterCommitExecutor).run(any(Runnable.class));
            verify(postPrevCache, never()).evictBoard(any());
            verify(postPrevCache, never()).evictPostPrev(any());
            verify(postPrevCache, never()).decrementBoardCount(any());
        }
    }
}
