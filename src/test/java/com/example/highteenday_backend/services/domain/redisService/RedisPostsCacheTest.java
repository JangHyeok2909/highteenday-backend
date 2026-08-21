package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("RedisPostsCache")
class RedisPostsCacheTest {

    @Mock private RedisTemplate<String, Long> boardTemplate;
    @Mock private RedisTemplate<String, PostPreviewDto> postTemplate;
    @Mock private RedisTemplate<String, Long> countingTemplate;
    @Mock private PostRepository postRepository;
    @Mock private ValueOperations<String, Long> countValueOps;
    @Mock private ListOperations<String, Long> boardListOps;
    @Mock private ValueOperations<String, PostPreviewDto> postValueOps;

    private static final String BOARD_KEY = "board:1:posts";

    private RedisPostsCache redisPostsCache;

    @BeforeEach
    void setUp() {
        redisPostsCache = new RedisPostsCache(boardTemplate, postTemplate, countingTemplate, postRepository);
    }

    @Nested
    @DisplayName("getPostPrevs")
    class GetPostPrevs {

        @Test
        @DisplayName("Redis 장애 시 DB에서 직접 조회하여 반환한다")
        void fallsBackToDbWhenRedisDown() {
            when(boardTemplate.opsForList())
                    .thenThrow(new RedisConnectionFailureException("down"));

            PostPreviewDto dto = PostPreviewDto.builder().id(1L).build();
            when(postRepository.findByBoard(any(PostListingDto.class))).thenReturn(List.of(dto));

            List<PostPreviewDto> result = redisPostsCache.getPostPrevs(1L, 0, 10);

            assertThat(result).hasSize(1);
            verify(postRepository).findByBoard(any(PostListingDto.class));
        }

        // ── KI-57: 재적재 여부는 range 결과가 아니라 리스트 길이로 판정해야 한다 ──

        @Test
        @DisplayName("리스트가 비어 있으면 DB 상위 50건으로 재적재한 뒤 요청 구간을 돌려준다")
        void reloadsFromDbWhenListIsEmpty() {
            PostPreviewDto p1 = PostPreviewDto.builder().id(11L).build();
            PostPreviewDto p2 = PostPreviewDto.builder().id(12L).build();

            when(boardTemplate.opsForList()).thenReturn(boardListOps);
            when(boardListOps.size(BOARD_KEY)).thenReturn(0L);
            when(postRepository.findByBoard(any(PostListingDto.class))).thenReturn(List.of(p1, p2));
            when(boardListOps.range(BOARD_KEY, 0L, 9L)).thenReturn(List.of(11L, 12L));
            when(postTemplate.opsForValue()).thenReturn(postValueOps);
            when(postValueOps.multiGet(List.of("posts:11", "posts:12"))).thenReturn(List.of(p1, p2));

            List<PostPreviewDto> result = redisPostsCache.getPostPrevs(1L, 0, 10);

            assertThat(result).containsExactly(p1, p2);
            verify(postRepository).findByBoard(any(PostListingDto.class));
        }

        @Test
        @DisplayName("리스트가 차 있으면 요청 구간이 리스트 밖이어도 DB를 다시 읽지 않는다")
        void doesNotReloadWhenListIsPopulatedButWindowIsOutOfRange() {
            when(boardTemplate.opsForList()).thenReturn(boardListOps);
            when(boardListOps.size(BOARD_KEY)).thenReturn(50L);
            when(boardListOps.range(BOARD_KEY, 60L, 79L)).thenReturn(List.of());

            List<PostPreviewDto> result = redisPostsCache.getPostPrevs(1L, 3, 20);

            assertThat(result).isEmpty();
            verify(postRepository, never()).findByBoard(any(PostListingDto.class));
        }
    }

    @Nested
    @DisplayName("getCount")
    class GetCount {

        @Test
        @DisplayName("Redis 장애 시 DB 카운트를 반환한다")
        void fallsBackToDbWhenRedisDown() {
            when(countingTemplate.opsForValue())
                    .thenThrow(new RedisConnectionFailureException("down"));
            when(postRepository.countTotal(1L)).thenReturn(42L);

            Long result = redisPostsCache.getCount(1L);

            assertThat(result).isEqualTo(42L);
            verify(postRepository).countTotal(1L);
        }
    }

    @Nested
    @DisplayName("createCount")
    class CreateCount {

        @Test
        @DisplayName("Redis 장애 시에도 DB 카운트를 반환한다")
        void returnsDbCountWhenRedisDown() {
            when(postRepository.countTotal(1L)).thenReturn(5L);
            when(countingTemplate.opsForValue()).thenReturn(countValueOps);
            org.mockito.Mockito.doThrow(new RedisConnectionFailureException("down"))
                    .when(countValueOps).set(anyString(), anyLong(), any(java.time.Duration.class));

            Long result = redisPostsCache.createCount(1L);

            assertThat(result).isEqualTo(5L);
        }
    }

}
