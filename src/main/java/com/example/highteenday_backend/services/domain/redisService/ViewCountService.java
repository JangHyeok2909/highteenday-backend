package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.services.global.RedisService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@RequiredArgsConstructor
@Service
public class ViewCountService {
    private final RedisService redisService;
    private static long expireTime=1;

    public void increaseViewCount(Long postId,Long userId){
        String dedupKey="viewed:"+postId+":"+userId;
        String countKey="post:views:"+postId;

        Boolean isNew = redisService.set(dedupKey, "1", expireTime);
        if(Boolean.TRUE.equals(isNew)){
            log.debug("조회수 증가. postId={}, userId={}", postId, userId);
            redisService.increaseCount(countKey);
        }

    }
    public int getViewCount(Long postId){
        String countKey="post:views:"+postId;
        Integer increment = (Integer) redisService.getValue(countKey);
        if(increment==null) increment=0;
        return increment;
    }
}
