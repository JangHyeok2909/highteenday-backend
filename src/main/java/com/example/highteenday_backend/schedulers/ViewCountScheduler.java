package com.example.highteenday_backend.schedulers;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.global.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

@Slf4j
@RequiredArgsConstructor
@Component
public class ViewCountScheduler {
    private final RedisService redisService;
    private final PostService postService;

    @Transactional
    @Scheduled(fixedRate = 60000) //1분마다 db 반영
    public void syncViewsToDB(){
        Set<String> keys = redisService.getKeysByPattern("post:views:*");
        if(keys == null) return;
        for(String redisKey:keys){
            String incremenValuetStr = redisService.getValue(redisKey).toString();
            if(incremenValuetStr == null) continue;
            String postIdStr = redisKey.replace("post:views:", "");
            long postId = Long.parseLong(postIdStr);
            long increment = Long.parseLong(incremenValuetStr);

            Post post = postService.findById(postId);
            post.addViewCount((int)increment);
            log.debug("조회수 동기화 완료. postId={}, increment={}", postId, increment);
            redisService.delete(redisKey);
        }
    }

}
