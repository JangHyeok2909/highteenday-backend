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
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
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

}
