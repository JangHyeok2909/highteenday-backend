package com.example.highteenday_backend.exceptions;

import com.example.highteenday_backend.controllers.PostController;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.services.domain.PostDetailService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.support.WebSliceTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.CannotCreateTransactionException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 예외를 응답으로 변환하는 계약을 검증한다.
 *
 * 고정하는 것 두 가지:
 * 1) 내부 예외 메시지가 응답 본문으로 새지 않는다 (400/404/409/500).
 * 2) CustomException 의 상세 메시지는 반대로 응답에 반영된다.
 *
 * 예외를 던지게 만드는 통로로 이미 있는 GET /api/posts/{postId} 를 쓴다.
 * 서비스가 목이라 어떤 예외든 마음대로 던질 수 있다.
 */
@WebSliceTest(PostController.class)
class GlobalExceptionHandlerTest {

    /** 실제 DB 예외가 담고 있는 것과 같은 형태의 내부 정보. */
    private static final String INTERNAL_DETAIL =
            "could not execute statement [Duplicate entry 'a@b.com' for key 'users.uk_users_email']";

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    PostService postService;

    @MockitoBean
    PostDetailService postDetailService;

    @Nested
    @DisplayName("내부 예외 메시지는 응답에 실리지 않는다")
    class NoInternalLeak {

        @Test
        @DisplayName("500 응답에 원인 문자열이 없다")
        void internalServerErrorHidesCause() throws Exception {
            given(postService.findById(1L)).willThrow(new IllegalStateException(INTERNAL_DETAIL));

            String body = mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"))
                    .andReturn().getResponse().getContentAsString();

            assertThat(body)
                    .as("500 본문에 내부 예외 메시지가 실리면 스키마가 노출된다")
                    .doesNotContain("uk_users_email")
                    .doesNotContain("a@b.com")
                    .doesNotContain("could not execute statement");
        }

        @Test
        @DisplayName("409 응답에 제약 조건 이름이 없다")
        void conflictHidesConstraintName() throws Exception {
            given(postService.findById(1L))
                    .willThrow(new DataIntegrityViolationException(INTERNAL_DETAIL));

            String body = mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isConflict())
                    .andReturn().getResponse().getContentAsString();

            assertThat(body).doesNotContain("uk_users_email");
        }

        @Test
        @DisplayName("404 응답에 내부 메시지가 없다")
        void notFoundHidesCause() throws Exception {
            given(postService.findById(1L))
                    .willThrow(new ResourceNotFoundException("post does not exist, postId=1, table=posts"));

            String body = mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isNotFound())
                    .andReturn().getResponse().getContentAsString();

            assertThat(body).doesNotContain("table=posts");
        }

        @Test
        @DisplayName("400 응답에 내부 메시지가 없다")
        void badRequestHidesCause() throws Exception {
            given(postService.findById(1L))
                    .willThrow(new IllegalArgumentException(INTERNAL_DETAIL));

            String body = mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isBadRequest())
                    .andReturn().getResponse().getContentAsString();

            assertThat(body).doesNotContain("uk_users_email");
        }
    }

    @Nested
    @DisplayName("CustomException 의 상세 메시지는 응답에 반영된다")
    class CustomExceptionDetail {

        @Test
        @DisplayName("상세를 넣어 던지면 그 상세가 나간다")
        void detailMessageReachesClient() throws Exception {
            given(postService.findById(1L))
                    .willThrow(new CustomException(ErrorCode.NO_ACCESS, "본인 글이 아닙니다."));

            mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("NO_ACCESS"))
                    .andExpect(jsonPath("$.message").value("본인 글이 아닙니다."));
        }

        @Test
        @DisplayName("상세 없이 던지면 ErrorCode 기본 메시지가 나간다")
        void fallsBackToErrorCodeMessage() throws Exception {
            given(postService.findById(1L)).willThrow(new CustomException(ErrorCode.NO_ACCESS));

            mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.message").value(ErrorCode.NO_ACCESS.getMessage()));
        }
    }

    /**
     * 의존성 장애와 코드 버그를 상태 코드로 가른다. 둘 다 500이면 클라이언트는 재시도할지
     * 포기할지 정할 수 없고, 대시보드에서도 "Redis가 죽었다"와 "새 배포가 터졌다"가
     * 같은 그래프에 합쳐진다.
     */
    @Nested
    @DisplayName("인프라 장애는 503, 코드 버그는 500")
    class InfrastructureVersusBug {

        @Test
        @DisplayName("커넥션을 못 얻으면 503")
        void connectionFailureIsServiceUnavailable() throws Exception {
            given(postService.findById(1L))
                    .willThrow(new CannotCreateTransactionException(INTERNAL_DETAIL));

            mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.code").value("INFRASTRUCTURE_UNAVAILABLE"));
        }

        @Test
        @DisplayName("쿼리·명령 타임아웃이면 503")
        void queryTimeoutIsServiceUnavailable() throws Exception {
            given(postService.findById(1L)).willThrow(new QueryTimeoutException(INTERNAL_DETAIL));

            mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isServiceUnavailable());
        }

        @Test
        @DisplayName("재시도해도 같은 결과인 DB 오류는 500으로 남는다")
        void nonTransientDbErrorStaysInternalServerError() throws Exception {
            // SQL 문법 오류처럼 의존성이 멀쩡해도 실패하는 경우다. 503으로 보내면
            // 클라이언트가 영원히 재시도한다.
            given(postService.findById(1L))
                    .willThrow(new InvalidDataAccessResourceUsageException(INTERNAL_DETAIL));

            mockMvc.perform(get("/api/posts/1"))
                    .andExpect(status().isInternalServerError());
        }

        @Test
        @DisplayName("503 본문에 내부 메시지가 없다")
        void serviceUnavailableHidesCause() throws Exception {
            given(postService.findById(1L))
                    .willThrow(new CannotCreateTransactionException(INTERNAL_DETAIL));

            String body = mockMvc.perform(get("/api/posts/1"))
                    .andReturn().getResponse().getContentAsString();

            assertThat(body).doesNotContain("uk_users_email");
        }
    }
}
