package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.Utils.HotScoreCalculator;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.services.domain.HotPostService;
import com.example.highteenday_backend.services.domain.PostService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;

@Slf4j
@RequiredArgsConstructor
@Component
public class HotScoreScheduler {
    private final RedisTemplate<String,Long> hotPidTemplate;
    private final HotPostService hotPostService;
    private final PostService postService;

    @Scheduled(fixedRate = 5*60*1000) //5분마다 상위 50개 점수 업데이트
    @Transactional
    public void updateHotScore(){
        String key = "hot:all:daily:" + LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Set<Long> range = hotPidTemplate.opsForZSet().reverseRange(key, 0, 49);
        log.info("Hot score 갱신");
        for(Long pid:range){
            hotPostService.updateDailyScore(pid);
        }

        //핫게시글 가져오기
        List<PostPreviewDto> dailyHotPosts = hotPostService.getDailyHotPosts();
        for (PostPreviewDto pre:dailyHotPosts){
            log.info("selectd hot post, postId="+pre.getId());
        }
    }

}
