package com.example.highteenday_backend.services.global;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Set;

@RequiredArgsConstructor
@Service
public class RedisService {
    private final RedisTemplate<String,String> redisTemplate;

    public Set<String> getKeysByPattern(String pattern){
        return redisTemplate.keys(pattern);
    }
    public void set(String key, String value){
        redisTemplate.opsForValue().set(key, value);
    }
    public Boolean set(String key, String value,long expireTime){
        return redisTemplate.opsForValue().setIfAbsent(key, value, Duration.ofHours(expireTime));
    }
    public Object getValue(String key){
        return redisTemplate.opsForValue().get(key);
    }
    public void delete(String key){
        redisTemplate.delete(key);
    }
    public Long increaseCount(String key){
        return redisTemplate.opsForValue().increment(key);
    }
}
