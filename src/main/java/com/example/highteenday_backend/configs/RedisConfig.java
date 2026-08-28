package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.GenericToStringSerializer;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

@Configuration
public class RedisConfig {
    @Bean
    public ObjectMapper redisObjectMapper() {
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return objectMapper;
    }

    /**
     * Long 값을 다루는 공용 템플릿. 게시판 목록·카운트·핫랭킹이 모두 이 하나를 쓴다.
     * 예전에는 구성이 완전히 같은 빈이 셋(boardTemplate·countingTemplate·hotPidTemplate)
     * 있었고, 같은 키를 증감은 A로 조회는 B로 하는 코드가 있어 읽는 사람을 혼란시켰다.
     */
    @Bean
    public RedisTemplate<String, Long> longRedisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Long> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericToStringSerializer<>(Long.class));
        return template;
    }

    @Bean
    public RedisTemplate<String, PostPreviewDto> postTemplate(RedisConnectionFactory connectionFactory,
                                                              ObjectMapper redisObjectMapper) {
        RedisTemplate<String, PostPreviewDto> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // Jackson2JsonRedisSerializer: 타입을 PostPreviewDto로 고정하므로
        // @class 메타데이터 없이도 정확하게 역직렬화됨
        Jackson2JsonRedisSerializer<PostPreviewDto> serializer =
                new Jackson2JsonRedisSerializer<>(redisObjectMapper, PostPreviewDto.class);

        template.setKeySerializer(new StringRedisSerializer());
        template.setHashKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(serializer);
        template.setHashValueSerializer(serializer);
        template.afterPropertiesSet();
        return template;
    }

    @Bean
    public StringRedisTemplate tokenRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }

}
