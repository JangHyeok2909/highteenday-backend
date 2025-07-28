package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.Utils.HotScoreCalculator;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.services.domain.HotPostService;
import com.example.highteenday_backend.services.domain.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Set;

@RequiredArgsConstructor
@Component
public class HotScoreScheduler {
    private final RedisTemplate<String,String> redisTemplate;
    private final HotPostService hotPostService;
    private final PostService postService;

    @Scheduled(fixedRate = 5*60*1000) //5분마다 전체 반영
    @Transactional
    public void updateHotScore(){
        String key = "hot:all:daily:" + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Set<String> postIdsStr = redisTemplate.opsForZSet().range(key, 0, -1);
        if(postIdsStr == null) return;
        for(String postIdStr:postIdsStr){
            Long postId = Long.parseLong(postIdStr);
            Post post = postService.findById(postId);
            hotPostService.updateDailyScore(post);
        }
    }

}
