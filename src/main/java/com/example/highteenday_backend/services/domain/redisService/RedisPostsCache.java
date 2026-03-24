package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.SortType;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;


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
        int start = page*size;
        int end = page*size+size-1;


        String idKey = createBoardKey(boardId);

        //boardId로 가져올 게시글 ids 조회, board 캐시미스 처리
        List<Long> ids = boardTemplate.opsForList().range(idKey, start, end);
        //boardId 없으면 캐싱
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


        return result;
    }

    @Override
    public void cachePostPrev(PostPreviewDto postPrev) {
        String key = createPostKey(postPrev.getId());
        postTemplate.opsForValue().set(key, postPrev, POST_TTL);
    }

    @Override
    public void addPostToBoard(Long boardId, Long postId) {
        String key = createBoardKey(boardId);
        boardTemplate.opsForList().rightPush(key,postId);
        boardTemplate.expire(key,BOARD_TTL);
        boardTemplate.opsForList().trim(key,0,MAX_SIZE-1);
    }

    @Override
    public Long getCount(Long boardId) {
        String key = createCountingKey(boardId);
        Long count = countingTemplate.opsForValue().get(key);
        return (count==null) ? createCount(boardId):count;
    }

    @Override
    public Long createCount(Long boardId) {
        String key = createCountingKey(boardId);
        Long count = postRepository.countTotal(boardId);
        countingTemplate.opsForValue().set(key,count,Duration.ofMinutes(5));
        return count;
    }
    @Override
    public void incrementBoardCount(Long boardId) {
        String key = createCountingKey(boardId);
        boardTemplate.opsForValue().increment(key, 1);
        boardTemplate.expire(key, BOARD_TTL); // 필요하면 TTL 갱신
    }
    @Override
    public void decrementBoardCount(Long boardId) {
        String key = createCountingKey(boardId);
        boardTemplate.opsForValue().decrement(key, 1);
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
