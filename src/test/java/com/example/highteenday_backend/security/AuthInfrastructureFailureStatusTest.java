package com.example.highteenday_backend.security;

import com.example.highteenday_backend.controllers.PostController;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.services.domain.PostDetailService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.support.WebSliceTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.CannotCreateTransactionException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.willThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 인증 판정이 실패한 이유에 따라 <b>실제로 나가는 HTTP 상태</b>가 갈리는지 고정한다.
 *
 * <p>왜 필터 단위 테스트({@link TokenAuthenticationFilterTest})와 따로 두는가: 필터가 던진
 * 예외는 DispatcherServlet에 닿지 않아 {@code @RestControllerAdvice}가 받지 못하고,
 * {@link TokenExceptionFilter}가 응답으로 바꾼다. 그 연결이 끊기면 필터 단위 테스트는
 * 통과하는데 클라이언트는 503 대신 500을 받는다. 필터 체인을 실제로 태워야 드러난다.
 *
 * <p>판정 방식: 보호 경로 {@code DELETE /api/posts/1} 하나에 같은 요청을 보내고
 * {@code getAuthentication()}이 던지는 예외 종류만 바꾼다. 두 경우 모두 컨트롤러에
 * 닿지 않으므로 상태 코드 차이는 온전히 필터의 판단이다.
 */
@WebSliceTest(PostController.class)
class AuthInfrastructureFailureStatusTest {

    /** 실제 예외 메시지에 들어 있는 내부 정보. 응답으로 새면 안 된다. */
    private static final String INTERNAL_DETAIL =
            "HikariPool-1 - Connection is not available, request timed out after 30001ms";

    @Autowired
    MockMvc mockMvc;

    /** WebSliceSecuritySupport 가 목으로 등록한 빈이다. 필터가 이 목을 통해 인증을 판정한다. */
    @Autowired
    TokenProvider tokenProvider;

    @MockitoBean
    PostService postService;

    @MockitoBean
    PostDetailService postDetailService;

    private int statusWhenAuthThrows(RuntimeException cause) throws Exception {
        // given(...) 형태는 스텁을 거는 순간 메서드를 실제로 호출해 이전 스텁의 예외가 터진다.
        // 이 목은 테스트 컨텍스트와 함께 살아 있으므로 호출 없이 스텁하는 이 형태를 쓴다.
        willThrow(cause).given(tokenProvider).getAuthentication(anyString());

        return mockMvc.perform(delete("/api/posts/1").cookie(new Cookie("accessToken", "any-token")))
                .andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("DB 커넥션을 못 얻으면 401이 아니라 503이다")
    void connectionFailureBecomesServiceUnavailable() throws Exception {
        int status = statusWhenAuthThrows(new CannotCreateTransactionException(INTERNAL_DETAIL));

        assertThat(status)
                .as("인프라 실패를 401로 내보내면 클라이언트가 토큰을 버린다")
                .isEqualTo(503);
    }

    @Test
    @DisplayName("Redis 명령 타임아웃도 503이다")
    void commandTimeoutBecomesServiceUnavailable() throws Exception {
        int status = statusWhenAuthThrows(new QueryTimeoutException(INTERNAL_DETAIL));

        assertThat(status).isEqualTo(503);
    }

    @Test
    @DisplayName("토큰이 만료된 경우는 종전대로 401이다")
    void expiredTokenStaysUnauthorized() throws Exception {
        int status = statusWhenAuthThrows(new TokenException(ErrorCode.TOKEN_EXPIRED));

        assertThat(status)
                .as("자격 증명 실패는 인프라 실패와 달리 재시도 대상이 아니다")
                .isEqualTo(401);
    }

    @Test
    @DisplayName("503 본문에 커넥션 풀 내부 메시지가 실리지 않는다")
    void serviceUnavailableHidesCause() throws Exception {
        willThrow(new CannotCreateTransactionException(INTERNAL_DETAIL))
                .given(tokenProvider).getAuthentication(anyString());

        String body = mockMvc.perform(delete("/api/posts/1").cookie(new Cookie("accessToken", "any-token")))
                .andExpect(status().isServiceUnavailable())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("HikariPool-1");
    }
}
