package com.example.highteenday_backend.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.server.PathContainer;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 공개 경로 목록이 의도한 범위를 벗어나지 않는지 검증한다.
 *
 * <p>SecurityConfig는 deny by default이므로 목록에 없는 경로가 열리는 사고는 구조적으로 막힌다.
 * 반대로 와일드카드가 너무 넓어 개인 데이터 경로까지 삼키는 사고는 막히지 않으므로 여기서 검증한다.
 */
class SecurityPolicyTest {

    private static final PathPatternParser PARSER = new PathPatternParser();

    private static final List<PathPattern> PUBLIC_GET_PATTERNS = parse(PublicEndpoints.PUBLIC_GET);
    private static final List<PathPattern> PUBLIC_POST_PATTERNS = parse(PublicEndpoints.PUBLIC_POST);
    private static final List<PathPattern> PUBLIC_ANY_PATTERNS = parse(PublicEndpoints.PUBLIC_ANY);

    @ParameterizedTest(name = "비공개 GET: {0}")
    @DisplayName("로그인 사용자 개인 데이터를 반환하는 GET 경로는 공개 목록에 걸리지 않는다")
    @ValueSource(strings = {
            "/api/friends/list",
            "/api/friends/requests/sent",
            "/api/friends/requests/received",
            "/api/mypage/posts",
            "/api/mypage/comments",
            "/api/mypage/scraps",
            "/api/notifications",
            "/api/notifications/unread-count",
            "/api/user/userInfo",
            "/api/user/OAuth2UserInfo",
            "/api/schools/meals/today",
            "/api/schools/meals/date",
            "/api/schools/meals/month",
            "/api/timetableTemplates",
            "/api/timetableTemplates/1/userTimetables",
            "/api/timetableTemplates/1/subjects",
            "/api/timetableTemplates/friends/2/default"
    })
    void privateGetPathsAreNotPublic(String path) {
        assertThat(matchesAny(PUBLIC_GET_PATTERNS, path))
                .as("%s 는 인증이 필요한 경로인데 공개 목록에 매칭되었다", path)
                .isFalse();
        assertThat(matchesAny(PUBLIC_ANY_PATTERNS, path)).isFalse();
    }

    @ParameterizedTest(name = "비공개 쓰기: {0}")
    @DisplayName("상태를 바꾸는 POST 경로는 인증 예외 목록에 걸리지 않는다")
    @ValueSource(strings = {
            "/api/posts",
            "/api/posts/1/comments",
            "/api/posts/1/reaction",
            "/api/posts/1/scraps",
            "/api/comments/1/reaction",
            "/api/friends/request",
            "/api/friends/respond",
            "/api/friends/search",
            "/api/media",
            "/api/user/logout",
            "/api/user/password/verify",
            "/api/timetableTemplates",
            "/api/timetableTemplates/import"
    })
    void privateWritePathsAreNotPublic(String path) {
        assertThat(matchesAny(PUBLIC_POST_PATTERNS, path))
                .as("%s 는 인증이 필요한 쓰기 경로인데 공개 목록에 매칭되었다", path)
                .isFalse();
        assertThat(matchesAny(PUBLIC_ANY_PATTERNS, path)).isFalse();
    }

    @ParameterizedTest(name = "공개 GET: {0}")
    @DisplayName("비로그인 열람이 가능해야 하는 경로는 공개 목록에 포함된다")
    @ValueSource(strings = {
            "/api/boards",
            "/api/boards/1/posts",
            "/api/posts/1",
            "/api/posts/search",
            "/api/posts/1/comments",
            "/api/posts/1/comments/2",
            "/api/hotposts/daily",
            "/api/schools/search",
            "/api/user/check/nickname",
            "/api/user/check/email",
            "/api/user/check/phone"
    })
    void publicGetPathsStayPublic(String path) {
        assertThat(matchesAny(PUBLIC_GET_PATTERNS, path))
                .as("%s 는 비로그인 열람이 가능해야 하는데 공개 목록에서 빠졌다", path)
                .isTrue();
    }

    @ParameterizedTest(name = "인증 진입점: {0}")
    @DisplayName("로그인/가입/토큰 재발급 경로는 인증 없이 접근 가능하다")
    @ValueSource(strings = {
            "/api/user/register",
            "/api/user/login",
            "/api/token/refresh"
    })
    void authenticationEntryPointsStayPublic(String path) {
        assertThat(matchesAny(PUBLIC_POST_PATTERNS, path)).isTrue();
    }

    @ParameterizedTest(name = "OAuth2/에러: {0}")
    @DisplayName("OAuth2 로그인과 에러 디스패치 경로는 메서드와 무관하게 열려 있다")
    @ValueSource(strings = {
            "/oauth2/authorization/google",
            "/oauth2/authorization/kakao",
            "/oauth2/login/code/google",
            "/error"
    })
    void oauthAndErrorPathsStayPublic(String path) {
        assertThat(matchesAny(PUBLIC_ANY_PATTERNS, path)).isTrue();
    }

    private static boolean matchesAny(List<PathPattern> patterns, String path) {
        PathContainer container = PathContainer.parsePath(path);
        return patterns.stream().anyMatch(p -> p.matches(container));
    }

    private static List<PathPattern> parse(String[] patterns) {
        return Arrays.stream(patterns).map(PARSER::parse).toList();
    }
}
