package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.services.global.RedisService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@RequiredArgsConstructor
@Service
public class ViewCountService {
    private final RedisService redisService;
    private static long expireTime=1;

    public void increaseViewCount(Long postId,Long userId){
        String dedupKey="viewed:"+postId+":"+userId;
        String countKey="post:views:"+postId;

        Boolean isNew = redisService.set(dedupKey, 1, expireTime);
        System.out.println("create redis ="+dedupKey);
        if(isNew){
            redisService.increaseCount(countKey, 1);
        }

    }
    public int getViewCount(Long postId){
        String countKey="post:views:"+postId;
        Integer increment = (Integer) redisService.get(countKey);
        if(increment==null) increment=0;
        return increment;
    }
}
