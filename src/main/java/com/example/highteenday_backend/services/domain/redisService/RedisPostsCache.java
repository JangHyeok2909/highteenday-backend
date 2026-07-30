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
    private final RedisTemplate<String, Long> boardTemplate;
    private final RedisTemplate<String, PostPreviewDto> postTemplate;
    private final RedisTemplate<String, Long> countingTemplate;
    private final PostRepository postRepository;

    private static final int MAX_SIZE=50;
    private static final Duration POST_TTL = Duration.ofMinutes(30);
    private static final Duration BOARD_TTL = Duration.ofMinutes(60);

    // ── AOP 미적용: DB fallback + self-invocation ──
    @Override
    public List<PostPreviewDto> getPostPrevs(Long boardId,int page,int size) {
        try {
            int start = page*size;
            int end = page*size+size-1;

            String idKey = createBoardKey(boardId);

            List<Long> ids = boardTemplate.opsForList().range(idKey, start, end);
            if(ids == null||ids.isEmpty()) {
                List<PostPreviewDto> postPreviewDtos = postRepository.findByBoard(PostListingDto.builder()
                        .boardId(boardId)
                        .page(0)
                        .size(MAX_SIZE)
                        .sortType(SortType.RECENT)
                        .build());

                for(PostPreviewDto p : postPreviewDtos){
                    addPostToBoard(boardId,p.getId());
                    cachePostPrev(p);
                }
                ids = boardTemplate.opsForList().range(idKey, start, end);
            }

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
        boardTemplate.opsForList().rightPush(key,postId);
        boardTemplate.expire(key,BOARD_TTL);
        boardTemplate.opsForList().trim(key,0,MAX_SIZE-1);
    }

    @ResilientRedis
    @Override
    public void evictBoard(Long boardId) {
        boardTemplate.delete(createBoardKey(boardId));
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
        boardTemplate.opsForValue().increment(key, 1);
        boardTemplate.expire(key, BOARD_TTL);
    }

    @ResilientRedis
    @Override
    public void decrementBoardCount(Long boardId) {
        String key = createCountingKey(boardId);
        boardTemplate.opsForValue().decrement(key, 1);
        boardTemplate.expire(key, BOARD_TTL);
    }

    // ── AOP 미적용: DB fallback 필요 ──

    @Override
    public Long getCount(Long boardId) {
        try {
            String key = createCountingKey(boardId);
            Long count = countingTemplate.opsForValue().get(key);
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
            countingTemplate.opsForValue().set(key,count,Duration.ofMinutes(5));
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
