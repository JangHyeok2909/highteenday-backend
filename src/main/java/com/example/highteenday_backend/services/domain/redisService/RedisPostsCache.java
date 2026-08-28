package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.aop.ResilientRedis;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.SortType;
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

    private static final Duration POST_TTL = Duration.ofMinutes(30);
    private static final Duration BOARD_TTL = Duration.ofMinutes(60);

    // ── AOP 미적용: DB fallback + self-invocation ──
    @Override
    public List<PostPreviewDto> getPostPrevs(Long boardId,int page,int size) {
        try {
            int start = page*size;
            int end = page*size+size-1;

            String idKey = createBoardKey(boardId);

            // 재적재 여부는 range 결과가 아니라 리스트 길이로 판정한다. range 가 빈 값을
            // 돌려주는 이유는 "캐시가 비었다"와 "요청 구간이 리스트 밖이다" 두 가지인데,
            // 뒤쪽에서 재적재하면 길이가 그대로라 다시 빈 값이 나온다 (KI-57).
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
            log.warn("Redis unavailable for getPostPrevs boardId={}, falling back to DB", boardId, e);
            return postRepository.findByBoard(PostListingDto.builder()
                    .boardId(boardId).page(page).size(size).sortType(SortType.RECENT).build());
        }
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
        String key = createCountingKey(boardId);
        longRedisTemplate.opsForValue().increment(key, 1);
        longRedisTemplate.expire(key, BOARD_TTL);
    }

    @ResilientRedis
    @Override
    public void decrementBoardCount(Long boardId) {
        String key = createCountingKey(boardId);
        longRedisTemplate.opsForValue().decrement(key, 1);
        longRedisTemplate.expire(key, BOARD_TTL);
    }

    // ── AOP 미적용: DB fallback 필요 ──

    @Override
    public Long getCount(Long boardId) {
        try {
            String key = createCountingKey(boardId);
            Long count = longRedisTemplate.opsForValue().get(key);
            return (count==null) ? createCount(boardId):count;
        } catch (Exception e) {
            log.warn("Redis unavailable for getCount boardId={}, falling back to DB", boardId, e);
            return postRepository.countTotal(boardId);
        }
    }

    @Override
    public Long createCount(Long boardId) {
        Long count = postRepository.countTotal(boardId);
        try {
            String key = createCountingKey(boardId);
            longRedisTemplate.opsForValue().set(key,count,Duration.ofMinutes(5));
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping createCount cache. boardId={}", boardId, e);
        }
        return count;
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
