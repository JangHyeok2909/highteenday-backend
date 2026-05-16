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
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
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
    @Mock private ListOperations<String, Long> listOps;
    @Mock private ValueOperations<String, PostPreviewDto> postValueOps;
    @Mock private ValueOperations<String, Long> countValueOps;

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

    @Nested
    @DisplayName("write/evict 작업 — Redis 장애 시 예외 없이 종료")
    class WriteOperations {

        @Test
        @DisplayName("cachePostPrev: Redis 장애 시 예외 없이 종료한다")
        void cachePostPrevDoesNotThrow() {
            when(postTemplate.opsForValue()).thenThrow(new RedisConnectionFailureException("down"));
            PostPreviewDto dto = PostPreviewDto.builder().id(1L).build();

            assertThatCode(() -> redisPostsCache.cachePostPrev(dto))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("addPostToBoard: Redis 장애 시 예외 없이 종료한다")
        void addPostToBoardDoesNotThrow() {
            when(boardTemplate.opsForList()).thenThrow(new RedisConnectionFailureException("down"));

            assertThatCode(() -> redisPostsCache.addPostToBoard(1L, 10L))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("evictBoard: Redis 장애 시 예외 없이 종료한다")
        void evictBoardDoesNotThrow() {
            when(boardTemplate.delete(anyString())).thenThrow(new RedisConnectionFailureException("down"));

            assertThatCode(() -> redisPostsCache.evictBoard(1L))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("evictPostPrev: Redis 장애 시 예외 없이 종료한다")
        void evictPostPrevDoesNotThrow() {
            when(postTemplate.delete(anyString())).thenThrow(new RedisConnectionFailureException("down"));

            assertThatCode(() -> redisPostsCache.evictPostPrev(1L))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("incrementBoardCount: Redis 장애 시 예외 없이 종료한다")
        void incrementBoardCountDoesNotThrow() {
            when(boardTemplate.opsForValue()).thenThrow(new RedisConnectionFailureException("down"));

            assertThatCode(() -> redisPostsCache.incrementBoardCount(1L))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("decrementBoardCount: Redis 장애 시 예외 없이 종료한다")
        void decrementBoardCountDoesNotThrow() {
            when(boardTemplate.opsForValue()).thenThrow(new RedisConnectionFailureException("down"));

            assertThatCode(() -> redisPostsCache.decrementBoardCount(1L))
                    .doesNotThrowAnyException();
        }
    }
}
