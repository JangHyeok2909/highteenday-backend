package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.Utils.HotScoreCalculator;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.services.domain.HotPostService;
import com.example.highteenday_backend.services.domain.PostService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@RequiredArgsConstructor
@Component
public class HotScoreScheduler {
    private final RedisTemplate<String,String> redisTemplate;
    private final HotPostService hotPostService;
    private final PostService postService;

    @Scheduled(fixedRate = 1*60*1000) //5분마다 전체 반영
    @Transactional
    public void updateHotScore(){
//        String key = "hot:all:daily:" + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        List<Post> allPosts = postService.findAll();
        log.info("Hot score 갱신");
        for(Post p:allPosts){
            hotPostService.updateDailyScore(p);
        }

        //핫게시글 가져오기
        List<Post> dailyHotPosts = hotPostService.getDailyHotPosts();
        for (Post p:dailyHotPosts){
            log.info("selectd hot post, postId="+p.getId());
        }
    }

}
