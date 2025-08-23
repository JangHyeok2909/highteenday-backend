package com.example.highteenday_backend.domain.verification;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.RedisSystemException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
@Slf4j
public class StateStore {
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private long ttlSeconds = 600;
    private String key(String state){
        return "oauth:state:" + state;
    }
    public record Payload(String returnTo, Long userId) {}

    public String issue(String returnTo, User user){

        System.out.println("1. returnTo : " + returnTo);
        if(returnTo == null || !returnTo.startsWith("/")){
            returnTo = "/";
        }
        System.out.println("2. returnTo : " + returnTo);


        String state = UUID.randomUUID().toString();
        try{
            String json = objectMapper.writeValueAsString(Map.of(
                    "returnTo", returnTo,
                    "userId", user.getId(),
                    "createdAt", Instant.now().toString()
            ));
            redis.opsForValue().set(key(state), json, ttlSeconds, TimeUnit.SECONDS);

            System.out.println("state 값 : " + state);
            return state;
        } catch (JsonProcessingException e) {
            // JSON 직렬화 실패
            throw new CustomException(ErrorCode.INTERNAL_ERROR, "인증 상태 직렬화에 실패했습니다.");

        } catch (DataAccessException e) {
            // Redis 연결/명령/데이터 접근 문제
            throw new CustomException(ErrorCode.DATABASE_ERROR, "인증 상태 저장에 실패했습니다.");
        }
    }

    public Payload consume(String state) {
        String json;
        String k = key(state);
        try {
            json = redis.opsForValue().get(k);
        } catch(DataAccessException e){
            throw new CustomException(ErrorCode.DATABASE_ERROR);
        }

        if(json == null) {
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }

        redis.delete(k);

        try{
            Map<String, Object> map = objectMapper.readValue(json, new TypeReference<>() {});
            String returnTo = (String) map.get("returnTo");
            Long userId = map.get("userId") == null ? null : Long.valueOf(map.get("userId").toString());
            return new Payload(returnTo, userId);
        } catch (JsonProcessingException e){
            throw new CustomException(ErrorCode.INTERNAL_ERROR);
        }

    }


}
