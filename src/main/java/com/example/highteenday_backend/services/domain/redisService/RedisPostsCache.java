package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.aop.ResilientRedis;
import com.example.highteenday_backend.aop.ResilientRedisExecutor;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.metrics.RedisFallbackMetrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;


@Slf4j
@Component
@RequiredArgsConstructor
public class RedisPostsCache implements PostPrevCache{
    private final RedisTemplate<String, Long> longRedisTemplate;
    private final RedisTemplate<String, PostPreviewDto> postTemplate;
    private final PostRepository postRepository;
    private final ResilientRedisExecutor executor;

    /**
     * {@link #getPostPrevs}만 계측을 직접 한다. 그 메서드는 본문에 DB 호출이 섞여 있어
     * {@link ResilientRedisExecutor#execute}로 감쌀 수 없고, 서킷 상태만 읽어 쓰기 때문이다.
     * 나머지 경로의 계측은 executor 가 한다.
     */
    private final RedisFallbackMetrics fallbackMetrics;

    /** 폴백 카운터의 태그 값. AOP 를 안 쓰는 경로라 이름을 직접 적는다. */
    private static final String GET_POST_PREVS = "RedisPostsCache.getPostPrevs";
    private static final String GET_COUNT = "RedisPostsCache.getCount";
    private static final String CREATE_COUNT = "RedisPostsCache.createCount";

    private static final Duration POST_TTL = Duration.ofMinutes(30);
    private static final Duration BOARD_TTL = Duration.ofMinutes(60);

    /**
     * 게시판 글 개수 캐시의 수명. 생성 경로와 증감 경로가 <b>같은 값</b>을 써야 한다.
     *
     * <p>예전에는 생성이 5분, 증감이 60분이라 어긋나 있었다. 5분 뒤 키가 사라진 상태에서
     * 글이 하나 써지면 증감 경로가 키를 60분짜리로 새로 만들었고, 그 사이 조회는 전부
     * 캐시 히트라 재집계가 돌지 않았다. 60분에 맞춘 이유는 게시글 목록 캐시
     * ({@link #BOARD_TTL})와 같은 주기로 만료시켜 두 캐시가 따로 놀지 않게 하기 위해서다.
     * 값 자체의 정확성은 TTL 이 아니라 증감이 지킨다.
     */
    private static final Duration COUNT_TTL = BOARD_TTL;

    // ── AOP 미적용: DB fallback + self-invocation ──

    /**
     * 본문이 Redis 와 DB 를 함께 부르므로 {@link ResilientRedisExecutor#execute}로 감싸지
     * 않는다. 감싸면 MySQL 실패가 Redis 서킷의 실패로 기록되고, 서킷이 열리면 캐시가 꺼져
     * 그만큼 부하가 다시 MySQL 로 몰린다. 그래서 서킷의 판단은 읽기만 하고 이 경로의 성패는
     * 서킷 통계에 넣지 않는다. 서킷이 배울 표본은 {@code @ResilientRedis} 메서드들이 만든다.
     */
    @Override
    public List<PostPreviewDto> getPostPrevs(Long boardId,int page,int size) {
        fallbackMetrics.register(GET_POST_PREVS);
        if (executor.isOpen()) {
            fallbackMetrics.recordFallback(GET_POST_PREVS, RedisFallbackMetrics.REASON_OPEN);
            return loadFromDb(boardId, page, size);
        }
        try {
            int start = page*size;
            int end = page*size+size-1;

            String idKey = createBoardKey(boardId);

            // 재적재 여부는 range 결과가 아니라 리스트 길이로 판정한다. range 가 빈 값을
            // 돌려주는 이유는 "캐시가 비었다"와 "요청 구간이 리스트 밖이다" 두 가지인데,
            // 뒤쪽에서 재적재하면 길이가 그대로라 다시 빈 값이 나온다.
            Long cachedSize = longRedisTemplate.opsForList().size(idKey);
            if(cachedSize == null || cachedSize == 0) {
                List<PostPreviewDto> postPreviewDtos = postRepository.findByBoard(PostListingDto.builder()
                        .boardId(boardId)
                        .page(0)
                        .size(MAX_CACHED_POSTS)
                        .sortType(SortType.RECENT)
                        .build());

                for(PostPreviewDto p : postPreviewDtos){
                    addPostToBoard(boardId,p.getId());
                    cachePostPrev(p);
                }
            }

            List<Long> ids = longRedisTemplate.opsForList().range(idKey, start, end);
            if(ids == null || ids.isEmpty()) return Collections.emptyList();

            List<String> keys = ids
                    .stream()
                    .map(id -> createPostKey(id))
                    .toList();

            List<PostPreviewDto> values =  postTemplate.opsForValue().multiGet(keys);
            if (values == null) return Collections.emptyList();

            List<Long> missIds = new ArrayList<>();
            List<PostPreviewDto> result = new ArrayList<>();

            for(int i=0;i<ids.size();i++){
                if(values.get(i) ==null) {
                    missIds.add(ids.get(i));
                    result.add(null);
                }
                else result.add(values.get(i));
            }

            if(!missIds.isEmpty()){
                List<PostPreviewDto> missPosts = postRepository.findAllDtoByIds(missIds);

                Map<Long, PostPreviewDto> missMap = missPosts.stream()
                        .collect(Collectors.toMap(PostPreviewDto::getId, p -> p));

                for(int i=0;i<result.size();i++){
                    if(result.get(i) == null){
                        Long id = ids.get(i);
                        PostPreviewDto dto = missMap.get(id);

                        if(dto != null){
                            cachePostPrev(dto);
                            result.set(i, dto);
                        }
                    }
                }
            }

            return result.stream().filter(Objects::nonNull).collect(Collectors.toList());
        } catch (Exception e) {
            fallbackMetrics.recordFallback(GET_POST_PREVS, RedisFallbackMetrics.REASON_ERROR);
            log.warn("Redis unavailable for getPostPrevs boardId={}, falling back to DB", boardId, e);
            return loadFromDb(boardId, page, size);
        }
    }

    private List<PostPreviewDto> loadFromDb(Long boardId, int page, int size) {
        return postRepository.findByBoard(PostListingDto.builder()
                .boardId(boardId).page(page).size(size).sortType(SortType.RECENT).build());
    }

    // ── AOP 적용: 단순 Redis 조작 ──

    @ResilientRedis
    @Override
    public void cachePostPrev(PostPreviewDto postPrev) {
        String key = createPostKey(postPrev.getId());
        postTemplate.opsForValue().set(key, postPrev, POST_TTL);
    }

    @ResilientRedis
    @Override
    public void addPostToBoard(Long boardId, Long postId) {
        String key = createBoardKey(boardId);
        longRedisTemplate.opsForList().rightPush(key,postId);
        longRedisTemplate.expire(key,BOARD_TTL);
        longRedisTemplate.opsForList().trim(key,0,MAX_CACHED_POSTS-1);
    }

    @ResilientRedis
    @Override
    public void evictBoard(Long boardId) {
        longRedisTemplate.delete(createBoardKey(boardId));
    }

    @ResilientRedis
    @Override
    public void evictPostPrev(Long postId) {
        postTemplate.delete(createPostKey(postId));
    }

    @ResilientRedis
    @Override
    public void incrementBoardCount(Long boardId) {
        applyCountDelta(boardId, 1);
    }

    @ResilientRedis
    @Override
    public void decrementBoardCount(Long boardId) {
        applyCountDelta(boardId, -1);
    }

    /**
     * 게시판 글 개수 캐시를 delta 만큼 옮긴다. 키가 없었으면 증감 대신 DB 로 다시 센다.
     *
     * <p>왜 키 존재 여부를 따지는가: Redis {@code INCRBY} 는 <b>키가 없으면 0 을 만든 뒤
     * 증가</b>시킨다. 값 직렬화가 평문 십진 문자열이라 타입 오류로 막히지도 않는다.
     * 그래서 캐시가 만료된 뒤 첫 글이 써지면 총 개수가 실제 5만이든 얼마든 <b>{@code 1}</b>
     * 이 됐고, 그 뒤 조회는 전부 캐시 히트라 다시 세어지지 않았다. 클라이언트는 이 값으로
     * 전체 페이지 수를 계산하므로 페이지네이션이 1페이지로 접혔다.
     *
     * <p>판정은 {@code INCRBY} 의 반환값으로 한다 — 반환값이 delta 와 같으면 직전 값이
     * 0, 즉 키가 없었다는 신호다. 별도로 {@code EXISTS} 를 먼저 부르면 확인과 증감
     * 사이에 키가 만료될 수 있어 오히려 틈이 생긴다. 실제로 개수가 정확히 1(또는 -1)이
     * 되는 경우에도 재집계가 도는데, DB 를 한 번 더 세는 것뿐이라 결과는 같다.
     */
    private void applyCountDelta(Long boardId, long delta) {
        String key = createCountingKey(boardId);
        Long updated = longRedisTemplate.opsForValue().increment(key, delta);

        if (updated == null || updated == delta) {
            // 키가 없던 상태에서 만들어진 값이다. 버리고 DB 기준으로 다시 채운다.
            createCount(boardId);
            return;
        }
        longRedisTemplate.expire(key, COUNT_TTL);
    }

    // ── AOP 미적용: DB fallback 필요 ──

    /**
     * 캐시에 값이 없을 때와 Redis 를 쓰지 못할 때가 같은 경로로 간다. 둘 다
     * {@link #createCount}가 DB 에서 다시 세기 때문이다.
     */
    @Override
    public Long getCount(Long boardId) {
        // createCount 는 DB 를 읽으므로 supplier 밖에 둔다. 안에 두면 MySQL 실패가 Redis
        // 서킷의 실패로 기록되고, 서킷 호출 안에 서킷 호출이 중첩된다.
        Long count = executor.execute(GET_COUNT,
                () -> longRedisTemplate.opsForValue().get(createCountingKey(boardId)),
                () -> null);
        return (count == null) ? createCount(boardId) : count;
    }

    @Override
    public Long createCount(Long boardId) {
        Long count = postRepository.countTotal(boardId);
        // 캐시에 넣지 못해도 개수는 이미 DB 에서 얻었으므로 그 값을 그대로 돌려준다.
        return executor.execute(CREATE_COUNT, () -> {
            longRedisTemplate.opsForValue().set(createCountingKey(boardId), count, COUNT_TTL);
            return count;
        }, () -> count);
    }

    // ── Key 생성 ──

    private String createBoardKey(Long boardId){
        return "board:"+boardId+":posts";
    }

    private String createPostKey(Long postId){
        return "posts:"+postId;
    }

    private String createCountingKey(Long boardId){
        return "board:" + boardId + ":count";
    }
}
