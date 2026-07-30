package com.example.highteenday_backend.services.domain.redisService;


import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@RequiredArgsConstructor
public class CursorCacheService {
//    private final RedisTemplate<String,Long> redisTemplate;
//
//    private String makeKey(Long boardId,int page){
//        return "boardId:"+boardId+":page:"+page;
//    }
//    // 페이지별 lastSeedId 저장
//
//    public void saveLastSeedId(Long boardId,int page,Long lastSeedId){
//        String key = makeKey(boardId, page);
//        redisTemplate.opsForValue().set(key,lastSeedId, Duration.ofMinutes(5));
//    }
//
//    public Long getLastSeedId(Long boardId,int page){
//        String key = makeKey(boardId, page);
//        return redisTemplate.opsForValue().get(key);
//    }
}
