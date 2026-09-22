package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.aop.ResilientRedisExecutor;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.metrics.RedisFallbackMetrics;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.Collection;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("RedisPostsCache")
class RedisPostsCacheTest {

    @Mock private RedisTemplate<String, Long> longRedisTemplate;
    @Mock private RedisTemplate<String, PostPreviewDto> postTemplate;
    @Mock private PostRepository postRepository;
    @Mock private ValueOperations<String, Long> countValueOps;
    @Mock private ListOperations<String, Long> boardListOps;
    @Mock private ValueOperations<String, PostPreviewDto> postValueOps;

    private static final String BOARD_KEY = "board:1:posts";

    private RedisPostsCache redisPostsCache;
    private SimpleMeterRegistry registry;
    private CircuitBreakerRegistry circuitBreakerRegistry;

    @BeforeEach
    void setUp() {
        // 목이 아니라 실제 레지스트리와 서킷을 쓴다 — 폴백 횟수가 실제로 기록되는지까지
        // 확인해야 하고, 서킷이 열렸을 때 Redis 를 건너뛰는지도 여기서 본다.
        registry = new SimpleMeterRegistry();
        circuitBreakerRegistry = CircuitBreakerRegistry.of(CircuitBreakerConfig.custom()
                // 서킷은 이 테스트가 직접 열 때만 열린다. 실패 주입이 쌓여서 저절로 열리면
                // 뒤이은 테스트가 Redis 를 안 부르게 되어 기대와 어긋난다.
                .minimumNumberOfCalls(Integer.MAX_VALUE)
                .recordExceptions(DataAccessException.class)
                .build());
        circuitBreakerRegistry.circuitBreaker("redis");

        RedisFallbackMetrics metrics = new RedisFallbackMetrics(registry);
        redisPostsCache = new RedisPostsCache(longRedisTemplate, postTemplate, postRepository,
                new ResilientRedisExecutor(circuitBreakerRegistry, metrics), metrics);
    }

    /** getPostPrevs 의 폴백 횟수. {@code reason} 두 계열의 합이다. */
    private double fallbackCount() {
        Collection<Counter> counters = registry.find("redis.fallback")
                .tag("method", "RedisPostsCache.getPostPrevs").counters();
        if (counters.isEmpty()) return -1;
        return counters.stream().mapToDouble(Counter::count).sum();
    }

    private double fallbackCount(String reason) {
        Counter c = registry.find("redis.fallback")
                .tag("method", "RedisPostsCache.getPostPrevs").tag("reason", reason).counter();
        return c == null ? -1 : c.count();
    }

    @Nested
    @DisplayName("getPostPrevs")
    class GetPostPrevs {

        @Test
        @DisplayName("Redis 장애 시 DB에서 직접 조회하여 반환한다")
        void fallsBackToDbWhenRedisDown() {
            when(longRedisTemplate.opsForList())
                    .thenThrow(new RedisConnectionFailureException("down"));

            PostPreviewDto dto = PostPreviewDto.builder().id(1L).build();
            when(postRepository.findByBoard(any(PostListingDto.class))).thenReturn(List.of(dto));

            List<PostPreviewDto> result = redisPostsCache.getPostPrevs(1L, 0, 10);

            assertThat(result).hasSize(1);
            verify(postRepository).findByBoard(any(PostListingDto.class));
            assertThat(fallbackCount())
                    .as("이 경로는 AOP 를 안 쓰므로, 직접 세지 않으면 폴백이 지표에 안 남는다")
                    .isEqualTo(1.0);
        }

        @Test
        @DisplayName("서킷이 열려 있으면 Redis 를 부르지 않고 바로 DB 로 간다")
        void skipsRedisEntirelyWhenCircuitIsOpen() {
            circuitBreakerRegistry.circuitBreaker("redis").transitionToOpenState();

            PostPreviewDto dto = PostPreviewDto.builder().id(1L).build();
            when(postRepository.findByBoard(any(PostListingDto.class))).thenReturn(List.of(dto));

            List<PostPreviewDto> result = redisPostsCache.getPostPrevs(1L, 0, 10);

            assertThat(result).hasSize(1);
            verify(longRedisTemplate, never()).opsForList();
            assertThat(fallbackCount("open"))
                    .as("서킷이 아낀 대기 시간은 open 건수로만 셀 수 있다 — error 와 합쳐 두면 못 센다")
                    .isEqualTo(1.0);
            assertThat(fallbackCount("error"))
                    .as("Redis 를 부르지도 않았으므로 접근 실패로 세면 안 된다")
                    .isEqualTo(0.0);
        }

        @Test
        @DisplayName("Redis 가 정상이면 폴백 횟수는 0 이지만 시계열은 존재한다")
        void registersZeroSeriesWhenRedisHealthy() {
            when(longRedisTemplate.opsForList()).thenReturn(boardListOps);
            when(boardListOps.size(BOARD_KEY)).thenReturn(1L);
            when(boardListOps.range(BOARD_KEY, 0, 9)).thenReturn(List.of(1L));
            when(postTemplate.opsForValue()).thenReturn(postValueOps);
            when(postValueOps.multiGet(any())).thenReturn(List.of(PostPreviewDto.builder().id(1L).build()));

            redisPostsCache.getPostPrevs(1L, 0, 10);

            assertThat(fallbackCount())
                    .as("정상 구간에 0 이 찍혀 있어야 장애 구간 값과 비교할 기준이 생긴다")
                    .isEqualTo(0.0);
        }

        // 재적재 여부는 range 결과가 아니라 리스트 길이로 판정해야 한다.

        @Test
        @DisplayName("리스트가 비어 있으면 DB 상위 50건으로 재적재한 뒤 요청 구간을 돌려준다")
        void reloadsFromDbWhenListIsEmpty() {
            PostPreviewDto p1 = PostPreviewDto.builder().id(11L).build();
            PostPreviewDto p2 = PostPreviewDto.builder().id(12L).build();

            when(longRedisTemplate.opsForList()).thenReturn(boardListOps);
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
            when(longRedisTemplate.opsForList()).thenReturn(boardListOps);
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
            when(longRedisTemplate.opsForValue())
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
            when(longRedisTemplate.opsForValue()).thenReturn(countValueOps);
            org.mockito.Mockito.doThrow(new RedisConnectionFailureException("down"))
                    .when(countValueOps).set(anyString(), anyLong(), any(java.time.Duration.class));

            Long result = redisPostsCache.createCount(1L);

            assertThat(result).isEqualTo(5L);
        }
    }

    /**
     * 글 개수 캐시가 만료 후 첫 쓰기에서 1로 되살아나던 문제를 검증한다.
     *
     * Redis INCRBY 는 키가 없으면 0 을 만든 뒤 증가시키므로, 반환값이 delta 와 같다는 것은
     * "직전 값이 0", 즉 키가 없었다는 신호다. 그때는 증감분을 믿지 말고 DB 로 다시 세야 한다.
     */
    @Nested
    @DisplayName("글 개수 증감")
    class CountDelta {

        private static final String COUNT_KEY = "board:1:count";

        @Test
        @DisplayName("키가 없는 상태의 증가는 1을 남기지 않고 DB 로 재집계한다")
        void incrementOnMissingKeyRecountsFromDb() {
            when(longRedisTemplate.opsForValue()).thenReturn(countValueOps);
            // 키가 없어 INCRBY 가 0 에서 시작 → 반환값 1
            when(countValueOps.increment(COUNT_KEY, 1L)).thenReturn(1L);
            when(postRepository.countTotal(1L)).thenReturn(50_000L);

            redisPostsCache.incrementBoardCount(1L);

            verify(postRepository).countTotal(1L);
            // 재집계 값으로 덮어써야 한다. 1 이 그대로 남으면 페이지네이션이 1페이지로 접힌다.
            verify(countValueOps).set(eq(COUNT_KEY), eq(50_000L), any(java.time.Duration.class));
        }

        @Test
        @DisplayName("키가 없는 상태의 감소도 -1을 남기지 않고 DB 로 재집계한다")
        void decrementOnMissingKeyRecountsFromDb() {
            when(longRedisTemplate.opsForValue()).thenReturn(countValueOps);
            when(countValueOps.increment(COUNT_KEY, -1L)).thenReturn(-1L);
            when(postRepository.countTotal(1L)).thenReturn(50_000L);

            redisPostsCache.decrementBoardCount(1L);

            verify(postRepository).countTotal(1L);
            verify(countValueOps).set(eq(COUNT_KEY), eq(50_000L), any(java.time.Duration.class));
        }

        @Test
        @DisplayName("키가 살아 있으면 DB 를 다시 세지 않고 증감만 한다")
        void incrementOnLiveKeySkipsDb() {
            when(longRedisTemplate.opsForValue()).thenReturn(countValueOps);
            when(countValueOps.increment(COUNT_KEY, 1L)).thenReturn(50_001L);

            redisPostsCache.incrementBoardCount(1L);

            verify(postRepository, never()).countTotal(anyLong());
            verify(longRedisTemplate).expire(eq(COUNT_KEY), any(java.time.Duration.class));
        }

        @Test
        @DisplayName("생성 경로와 증감 경로의 TTL 이 같다 — 어긋나면 만료 후 되살아남이 재현된다")
        void createAndDeltaShareTheSameTtl() {
            when(longRedisTemplate.opsForValue()).thenReturn(countValueOps);
            when(postRepository.countTotal(1L)).thenReturn(7L);
            when(countValueOps.increment(COUNT_KEY, 1L)).thenReturn(50_001L);

            redisPostsCache.createCount(1L);
            redisPostsCache.incrementBoardCount(1L);

            ArgumentCaptor<java.time.Duration> setTtl = ArgumentCaptor.forClass(java.time.Duration.class);
            verify(countValueOps).set(eq(COUNT_KEY), anyLong(), setTtl.capture());

            ArgumentCaptor<java.time.Duration> expireTtl = ArgumentCaptor.forClass(java.time.Duration.class);
            verify(longRedisTemplate).expire(eq(COUNT_KEY), expireTtl.capture());

            assertThat(setTtl.getValue()).isEqualTo(expireTtl.getValue());
        }
    }
}
