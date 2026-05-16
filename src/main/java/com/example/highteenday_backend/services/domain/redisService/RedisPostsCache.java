package com.example.highteenday_backend.services.domain.redisService;

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

    @Override
    public List<PostPreviewDto> getPostPrevs(Long boardId,int page,int size) {
        try {
            int start = page*size;
            int end = page*size+size-1;

            String idKey = createBoardKey(boardId);

            //boardId로 가져올 게시글 ids 조회, board 캐시미스 처리
            List<Long> ids = boardTemplate.opsForList().range(idKey, start, end);
            //가져온 ids 없으면 캐싱
            if(ids == null||ids.isEmpty()) {
                List<PostPreviewDto> postPreviewDtos = postRepository.findByBoard(PostListingDto.builder()
                        .boardId(boardId)
                        .page(0)
                        .size(MAX_SIZE)
                        .sortType(SortType.RECENT)
                        .build());

                for(PostPreviewDto p : postPreviewDtos){
                    //board 캐싱
                    addPostToBoard(boardId,p.getId());
                    cachePostPrev(p);
                }
                ids = boardTemplate.opsForList().range(idKey, start, end);
            }

            //ids: [10,6,5,2, ..]

            List<String> keys = ids
                    .stream()
                    .map(id -> createPostKey(id))
                    .toList();

            List<PostPreviewDto> values =  postTemplate.opsForValue().multiGet(keys);
            if (values == null) return Collections.emptyList();

            //캐시 미스된 postId 수집
            List<Long> missIds = new ArrayList<>();
            List<PostPreviewDto> result = new ArrayList<>();

            for(int i=0;i<ids.size();i++){
                //캐시미스
                if(values.get(i) ==null) {
                    //result: [10,6,null,null,..]
                    missIds.add(ids.get(i));
                    result.add(null);
                }
                else result.add(values.get(i));
            }

            //캐시미스된 post만 DB에서 불러옴.
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

    @Override
    public void cachePostPrev(PostPreviewDto postPrev) {
        try {
            String key = createPostKey(postPrev.getId());
            postTemplate.opsForValue().set(key, postPrev, POST_TTL);
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping cachePostPrev. postId={}", postPrev.getId(), e);
        }
    }

    @Override
    public void addPostToBoard(Long boardId, Long postId) {
        try {
            String key = createBoardKey(boardId);
            boardTemplate.opsForList().rightPush(key,postId);
            boardTemplate.expire(key,BOARD_TTL);
            boardTemplate.opsForList().trim(key,0,MAX_SIZE-1);
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping addPostToBoard. boardId={}, postId={}", boardId, postId, e);
        }
    }

    @Override
    public void evictBoard(Long boardId) {
        try {
            boardTemplate.delete(createBoardKey(boardId));
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping evictBoard. boardId={}", boardId, e);
        }
    }

    @Override
    public void evictPostPrev(Long postId) {
        try {
            postTemplate.delete(createPostKey(postId));
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping evictPostPrev. postId={}", postId, e);
        }
    }

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

    @Override
    public void incrementBoardCount(Long boardId) {
        try {
            String key = createCountingKey(boardId);
            boardTemplate.opsForValue().increment(key, 1);
            boardTemplate.expire(key, BOARD_TTL);
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping incrementBoardCount. boardId={}", boardId, e);
        }
    }

    @Override
    public void decrementBoardCount(Long boardId) {
        try {
            String key = createCountingKey(boardId);
            boardTemplate.opsForValue().decrement(key, 1);
            boardTemplate.expire(key, BOARD_TTL);
        } catch (Exception e) {
            log.warn("Redis unavailable, skipping decrementBoardCount. boardId={}", boardId, e);
        }
    }

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
