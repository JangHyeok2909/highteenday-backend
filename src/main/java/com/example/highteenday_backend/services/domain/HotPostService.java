package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.Utils.HotScoreCalculator;
import com.example.highteenday_backend.domain.posts.Post;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;


/*게시판별 인기글, 실시간 인기글
 * 실시간 인기글:반응마다 스코어 갱신,5분마다 5개 선정하고 좋아요 컷 10개,하루단위 시간감쇄율
 * 게시판별 인기글:1분마다 스코어 갱신, 1분마다 3개 선정하고 좋아요 컷 5개, 시간감쇄 없이 db 저장
 * */

@RequiredArgsConstructor
@Service
public class HotPostService {
    private final RedisTemplate<String, String> redisTemplate;
    private final PostService postService;

    @Transactional
    public void updateRecentScore(Post post){
        Long boardId = post.getBoard().getId();
        Long postId = post.getId();

        String key="hot:board:"+boardId+"realtime:"+getRealtime5Min();
        double score = HotScoreCalculator.calculateRecentHotScore(post);
        redisTemplate.opsForZSet().add(key, String.valueOf(postId), score);
    }
    public List<Post> getRecentHotPosts(Long boardId){
        String key="hot:board:"+boardId+"realtime:"+getRealtime5Min();
        List<Post> top3Posts = new ArrayList<>();
        Set<String> top3PostIds = redisTemplate.opsForZSet().reverseRange(key, 0, 2);
        for(String pids:top3PostIds){
            Long postId = Long.parseLong(pids);
            Post post = postService.findById(postId);
            top3Posts.add(post);
        }
        return top3Posts;
    }
    @Transactional
    public void updateDailyScore(Post post){
        Long postId = post.getId();
        String key = "hot:all:daily:" + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        double score = HotScoreCalculator.calculateRecentHotScore(post);
        redisTemplate.opsForZSet().add(key, String.valueOf(postId), score);
    }

    public List<Post> getDailyHotPosts(){
        String key = "hot:all:daily:" + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        List<Post> top10Posts = new ArrayList<>();
        Set<String> top10PostIds = redisTemplate.opsForZSet().reverseRange(key, 0, 2);
        for(String pids:top10PostIds){
            Long postId = Long.parseLong(pids);
            Post post = postService.findById(postId);
            if(post.getLikeCount()>=10)top10Posts.add(post);
        }
        return top10Posts;
    }

    public String getRealtime5Min(){
        DateTimeFormatter realtimeFormatter = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
        LocalDateTime now = LocalDateTime.now().withSecond(0).withNano(0);
        //5분 단위로 분 설정
        int minute = (now.getMinute() / 5) * 5;
        now = now.withMinute(minute);
        return now.format(realtimeFormatter);
    }
}
