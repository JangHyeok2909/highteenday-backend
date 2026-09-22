package com.example.highteenday_backend.configs;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Redis 가 죽었을 때 집계 헬스와 readiness 가 서로 다른 답을 하는지 확인한다.
 *
 * <p>이 앱은 Redis 없이도 응답한다. 목록·개수는 DB 로 다시 읽고, 인기글은
 * {@code daily_hot_post} 로 떨어지고, 리프레시 토큰은 DB 조회로 간다.
 * 그런데 {@code /actuator/health} 는 인디케이터 다섯 개를 AND 로 묶으므로 Redis 하나에
 * 503 이 된다. 로드밸런서가 그 경로를 보면 모든 인스턴스가 같은 Redis 를 보기 때문에
 * 동시에 타겟에서 빠지고, 폴백으로 버티던 부분 저하가 전면 장애가 된다.</p>
 *
 * <p>세 번째 단언이 이 테스트의 핵심이다. readiness 그룹에 {@code db} 나 {@code redis} 를
 * 넣는 변경이 들어오면 위 장애가 그대로 돌아오는데, 그 변경은 설정 한 줄이라 리뷰에서
 * 놓치기 쉽다. 여기서 막는다.</p>
 */
@SpringBootTest(properties = {
        // 개발 장비에 Redis 가 떠 있어도 판정이 달라지지 않도록 닫힌 포트를 쓴다.
        "spring.data.redis.port=6399",
        // 단언이 components 를 읽어야 하므로 상세를 연다. test 프로파일 기본값은 이것과 다르다.
        "management.endpoint.health.show-details=always",
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestFileStorageConfig.class)
class HealthGroupTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    @DisplayName("집계 헬스는 Redis 가 죽으면 503 과 DOWN 을 보고한다")
    void aggregateHealthReportsRedisDown() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.components.redis.status").value("DOWN"));
    }

    @Test
    @DisplayName("같은 상황에서 readiness 는 200 UP 이다")
    void readinessStaysUpWhileRedisIsDown() throws Exception {
        mockMvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    @DisplayName("readiness 그룹에 공유 의존성이 들어 있지 않다")
    void readinessGroupExcludesSharedDependencies() throws Exception {
        mockMvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.redis").doesNotExist())
                .andExpect(jsonPath("$.components.db").doesNotExist());
    }
}
