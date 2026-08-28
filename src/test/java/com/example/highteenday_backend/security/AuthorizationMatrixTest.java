package com.example.highteenday_backend.security;

import com.example.highteenday_backend.configs.TestFileStorageConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 인가 매트릭스 — "어떤 경로가 로그인 없이 열려 있는가"를 테스트로 고정한다
 * (docs/KNOWN-ISSUES.md KI-04, KI-52).
 *
 * 왜 필요한가: SecurityConfig 의 인가 규칙은 선언 순서에 민감하고, 규칙 하나를
 * 옮기면 무관해 보이는 경로가 조용히 열리거나 닫힌다. 코드 리뷰로는 잡기 어렵고
 * 실제 요청으로만 드러난다. 이 테스트는 규칙표를 실행 가능한 형태로 옮긴 것이다.
 *
 * 판정 방식: **비로그인 요청만** 보낸다.
 * - 보호 경로는 컨트롤러에 닿기 전에 401 이어야 한다.
 * - 공개 경로는 401 이 아니기만 하면 된다 (본문 검증·데이터 부재로 400/404/500 이
 *   날 수 있고, 그것은 인가 규칙의 관심사가 아니다).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestFileStorageConfig.class)
class AuthorizationMatrixTest {

    @Autowired
    MockMvc mockMvc;

    private int statusOf(String method, String path) throws Exception {
        var request = MockMvcRequestBuilders
                .request(HttpMethod.valueOf(method), path)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}");
        return mockMvc.perform(request).andReturn().getResponse().getStatus();
    }

    @DisplayName("비로그인에게 열려 있어야 하는 경로")
    @ParameterizedTest(name = "{0} {1} → 401 이 아니어야 한다")
    @CsvSource({
            "GET, /api/boards",
            "GET, /api/boards/1/posts",
            "GET, /api/posts/1",
            "GET, /api/posts/1/comments",
            "GET, /api/hotposts/daily",
            "GET, /api/schools/search",
            "GET, /api/user/check/nickname",
    })
    void publicEndpointsStayOpen(String method, String path) throws Exception {
        assertThat(statusOf(method, path))
                .as("%s %s 는 비로그인 공개 경로여야 한다", method, path)
                .isNotEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    @DisplayName("비로그인이면 401 이어야 하는 경로")
    @ParameterizedTest(name = "{0} {1} → 401")
    @CsvSource({
            // 쓰기는 전부 인증 필요
            "POST,   /api/posts",
            "PATCH,  /api/posts/1",
            "DELETE, /api/posts/1",
            "POST,   /api/posts/1/comments",
            "PATCH,  /api/posts/1/comments/1",
            "DELETE, /api/posts/1/comments/1",
            "POST,   /api/posts/1/reaction",
            "POST,   /api/posts/1/scraps",
            "POST,   /api/friends/request",
            "POST,   /api/chat/rooms",
            "DELETE, /api/user/account",
            "POST,   /api/user/logout",
            // 개인 데이터 조회도 인증 필요
            "GET,    /api/mypage/posts",
            "GET,    /api/notifications",
            "GET,    /api/chat/rooms",
            "GET,    /api/user/userInfo",
            "GET,    /api/timetableTemplates",
            "GET,    /api/schools/meals/today",
    })
    void protectedEndpointsRequireLogin(String method, String path) throws Exception {
        assertThat(statusOf(method, path))
                .as("%s %s 는 비로그인 요청을 401 로 막아야 한다", method, path)
                .isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }

    /**
     * 화이트리스트인지 블랙리스트인지를 가르는 테스트 (KI-04).
     *
     * 아직 매핑되지 않은 GET 경로를 비로그인으로 부른다.
     * - 화이트리스트: 공개 목록에 없으므로 401 — 새 엔드포인트의 기본값이 "차단"이다.
     * - 블랙리스트(예전): `GET /**` 가 permitAll 이라 인가를 통과하고 핸들러가 없어 404.
     *
     * 즉 이 테스트는 KI-04 의 증상 그 자체 — "새 GET 이 기본 공개가 된다" — 를 잡는다.
     * 규칙을 되돌리면 401 이 404 로 바뀌면서 실패한다.
     */
    @org.junit.jupiter.api.Test
    @DisplayName("공개 목록에 없는 새 GET 경로는 기본값이 차단이다")
    void unlistedGetPathDefaultsToDenied() throws Exception {
        assertThat(statusOf("GET", "/api/some-endpoint-added-tomorrow"))
                .as("공개 목록에 없는 GET 이 401 이 아니면 인가 구조가 블랙리스트로 되돌아간 것이다")
                .isEqualTo(HttpStatus.UNAUTHORIZED.value());
    }
}
