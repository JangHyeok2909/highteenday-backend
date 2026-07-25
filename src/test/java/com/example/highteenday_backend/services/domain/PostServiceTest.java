package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.UpdatePostDto;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.exceptions.CustomException;
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

    @InjectMocks
    private PostService postService;

    private static final Long BOARD_ID = 1L;
    private static final int SIZE = 10;

    private PostListingDto dto(int page, SortType sortType) {
        return PostListingDto.builder()
                .boardId(BOARD_ID).page(page).sortType(sortType).size(SIZE)
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
    }

    @Nested
    @DisplayName("updatePost / deletePost — 작성자 검증")
    class AuthorOnlyMutation {

        private static final Long AUTHOR_ID = 1L;
        private static final Long STRANGER_ID = 2L;
        private static final Long POST_ID = 100L;

        private Post post;

        @BeforeEach
        void setUp() {
            User author = User.builder().id(AUTHOR_ID).build();
            post = Post.builder()
                    .id(POST_ID).user(author).board(Board.builder().id(BOARD_ID).build())
                    .title("원본 제목").content("원본 내용")
                    .build();
            when(postRepository.findById(POST_ID)).thenReturn(Optional.of(post));
        }

        @Test
        @DisplayName("작성자 본인이면 제목이 수정된다")
        void authorCanUpdate() {
            postService.updatePost(POST_ID, AUTHOR_ID, updateDto("수정된 제목", "원본 내용"));

            assertThat(post.getTitle()).isEqualTo("수정된 제목");
        }

        @Test
        @DisplayName("작성자가 아니면 NO_ACCESS로 거부하고 제목/본문을 바꾸지 않는다")
        void strangerCannotUpdate() {
            assertThatThrownBy(() -> postService.updatePost(POST_ID, STRANGER_ID, updateDto("변조 제목", "변조 내용")))
                    .isInstanceOf(CustomException.class)
                    .extracting(e -> ((CustomException) e).getErrorCode())
                    .isEqualTo(ErrorCode.NO_ACCESS);

            assertThat(post.getTitle()).isEqualTo("원본 제목");
            verifyNoInteractions(mediaProcessingService);
        }

        @Test
        @DisplayName("작성자 본인이면 삭제된다")
        void authorCanDelete() {
            postService.deletePost(POST_ID, AUTHOR_ID);

            assertThat(post.getIsValid()).isFalse();
        }

        @Test
        @DisplayName("작성자가 아니면 NO_ACCESS로 거부하고 삭제하지 않는다")
        void strangerCannotDelete() {
            assertThatThrownBy(() -> postService.deletePost(POST_ID, STRANGER_ID))
                    .isInstanceOf(CustomException.class)
                    .extracting(e -> ((CustomException) e).getErrorCode())
                    .isEqualTo(ErrorCode.NO_ACCESS);

            assertThat(post.getIsValid()).isTrue();
            verifyNoInteractions(postPrevCache);
        }

        private UpdatePostDto updateDto(String title, String content) {
            return UpdatePostDto.builder().title(title).content(content).build();
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
