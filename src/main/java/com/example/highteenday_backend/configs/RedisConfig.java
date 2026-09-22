package com.example.highteenday_backend.configs;

import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.lettuce.core.metrics.MicrometerOptions;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.GenericToStringSerializer;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;

@Configuration
public class RedisConfig {

    /**
     * Lettuce 명령 지연을 분위수까지 낼 수 있게 설정한다.
     *
     * <p>스프링 부트의 {@code LettuceMetricsAutoConfiguration} 이 이미 지연을 Micrometer 로
     * 내보내고 있지만, 그쪽 기본값({@code MicrometerOptions.create()})은 히스토그램이 꺼져 있어
     * 건수·합계·최댓값만 남는다. 그 상태로는 분위수를 구할 수 없다. 이 빈을 정의하면 자동 설정이
     * {@code @ConditionalOnMissingBean} 으로 물러나고 아래 설정이 쓰인다.</p>
     *
     * <p>왜 이 값이 필요한가: Redis 서버의 {@code INFO} 지표는 서버가 명령을 처리한 시간만
     * 알려 준다. 명령 하나에 실제로 걸리는 시간에는 네트워크 왕복과 Lettuce 내부 대기가 더
     * 들어가고, 명령 타임아웃은 그 전체에 걸린다. 타임아웃 값은 클라이언트가 잰 지연의 꼬리값
     * (p99.9)보다 커야 한다. 그보다 낮게 잡으면 Redis 가 정상인데도 호출이 실패하는데, 이 앱은
     * {@code ResilientRedisAspect} 가 그 실패를 삼키므로 조회수만 조용히 사라진다.</p>
     *
     * <p>{@code minLatency} 를 기본값 1ms 에서 100µs 로 낮춘다. 같은 호스트의 Redis 는 대부분
     * 1ms 안에 끝나서, 기본값 그대로면 거의 모든 표본이 첫 버킷에 몰려 분위수가 1ms 에 붙는다.
     * {@code maxLatency} 는 1분으로 좁힌다 — 기본값 5분은 관측할 일이 없는 구간까지 버킷을
     * 만든다. 명령 타임아웃({@code spring.data.redis.timeout})을 200ms 로 줄인 뒤에도 이
     * 상한을 그대로 두는 이유는, 줄이기 전에 측정한 실행과 같은 버킷 경계로 비교하기
     * 위해서다. 상한 위 구간은 표본이 없어 비어 있을 뿐 분위수를 바꾸지 않는다.</p>
     *
     * <p>비용: 명령 종류마다 버킷 시계열이 생긴다. 명령 20종이면 수천 개 수준이다.</p>
     *
     * @return 히스토그램을 켠 Lettuce 지표 설정.
     */
    @Bean
    public MicrometerOptions lettuceMicrometerOptions() {
        return MicrometerOptions.builder()
                .histogram(true)
                .minLatency(Duration.ofNanos(100_000))
                .maxLatency(Duration.ofMinutes(1))
                .build();
    }

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
