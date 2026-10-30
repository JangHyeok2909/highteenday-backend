package com.example.highteenday_backend.security;

import com.example.highteenday_backend.controllers.PostController;
import com.example.highteenday_backend.controllers.TokenController;
import com.example.highteenday_backend.domain.Token.Token;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.services.domain.PostDetailService;
import com.example.highteenday_backend.services.domain.PostService;
import com.example.highteenday_backend.services.domain.TokenService;
import com.example.highteenday_backend.services.security.CustomOAuth2UserService;
import com.example.highteenday_backend.services.security.JwtCookieService;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Date;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 토큰 종류 검사와 재발급 거절이 실제 HTTP 상태로 이어지는지 고정한다.
 *
 * <p>다른 웹 슬라이스 테스트는 {@link TokenProvider} 를 목으로 바꿔 끼우므로 서명·종류 검사를
 * 거치지 않는다. 여기서는 실제 TokenProvider 로 토큰을 만들고 보안 필터 체인과 컨트롤러를
 * 그대로 태운다. 저장소 쪽(TokenService, UserRepository)만 목이다.
 *
 * <p>보호 경로는 {@code DELETE /api/posts/1}, 공개 경로는 {@code POST /api/token/refresh} 다.
 */
@WebMvcTest(controllers = {PostController.class, TokenController.class})
@ActiveProfiles("test")
@Import({SecurityConfig.class, TokenProvider.class})
class TokenTypeHttpStatusTest {

    private static final String EMAIL = "test@test.com";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    TokenProvider tokenProvider;

    @Value("${jwt.key}")
    String jwtKey;

    @MockitoBean
    TokenService tokenService;

    @MockitoBean
    UserRepository userRepository;

    @MockitoBean
    JwtCookieService jwtCookieService;

    @MockitoBean
    PostService postService;

    @MockitoBean
    PostDetailService postDetailService;

    @MockitoBean
    CustomOAuth2UserService customOAuth2UserService;

    @MockitoBean
    OAuth2SuccessHandler oAuth2SuccessHandler;

    private User user;
    private Authentication authentication;

    @BeforeEach
    void setUp() {
        user = User.builder()
                .id(1L)
                .email(new Email(EMAIL))
                .name(new UserName("홍길동"))
                .nickname(new Nickname("테스터"))
                .provider(Provider.DEFAULT)
                .role(Role.USER)
                .build();
        CustomUserPrincipal principal = new CustomUserPrincipal(user);
        authentication = new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());

        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
    }

    private int deletePostWithAccessCookie(String token) throws Exception {
        return mockMvc.perform(delete("/api/posts/1").cookie(new Cookie("accessToken", token)))
                .andReturn().getResponse().getStatus();
    }

    private int refreshWithRefreshCookie(String token) throws Exception {
        return mockMvc.perform(post("/api/token/refresh").cookie(new Cookie("refreshToken", token)))
                .andReturn().getResponse().getStatus();
    }

    private String refreshToken() {
        // generateRefreshToken 은 저장(tokenService.saveOrUpdate)까지 하므로 목이 받는다.
        return tokenProvider.generateRefreshToken(authentication, tokenProvider.generateAccessToken(authentication));
    }

    @Test
    @DisplayName("Access Token 으로는 보호 경로가 200 이다")
    void accessTokenPassesProtectedPath() throws Exception {
        String accessToken = tokenProvider.generateAccessToken(authentication);

        assertThat(deletePostWithAccessCookie(accessToken)).isEqualTo(200);
    }

    @Test
    @DisplayName("Refresh Token 을 accessToken 쿠키에 넣으면 보호 경로가 401 이다")
    void refreshTokenInAccessCookieIsUnauthorized() throws Exception {
        assertThat(deletePostWithAccessCookie(refreshToken())).isEqualTo(401);
    }

    @Test
    @DisplayName("Access Token 으로 재발급을 요청하면 401 이고 저장된 토큰을 조회하지 않는다")
    void accessTokenForRefreshIsUnauthorized() throws Exception {
        String accessToken = tokenProvider.generateAccessToken(authentication);

        assertThat(refreshWithRefreshCookie(accessToken)).isEqualTo(401);
        verify(tokenService, never()).findByRefreshTokenOrThrow(anyString());
    }

    @Test
    @DisplayName("종류 클레임이 없는 토큰은 보호 경로와 재발급 모두 401 이다")
    void tokenWithoutTypeIsUnauthorized() throws Exception {
        String untypedToken = Jwts.builder()
                .setSubject(EMAIL)
                .claim("role", "ROLE_USER")
                .claim("name", "홍길동")
                .claim("provider", Provider.DEFAULT.name())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 60_000))
                .signWith(Keys.hmacShaKeyFor(jwtKey.getBytes()), SignatureAlgorithm.HS512)
                .compact();

        assertThat(deletePostWithAccessCookie(untypedToken)).isEqualTo(401);
        assertThat(refreshWithRefreshCookie(untypedToken)).isEqualTo(401);
    }

    @Test
    @DisplayName("폐기된 Refresh Token 은 사용자를 조회하지 않고 401 로 거절한다")
    void revokedRefreshTokenIsRejectedBeforeUserLookup() throws Exception {
        String refreshToken = refreshToken();
        when(tokenService.findByRefreshTokenOrThrow(refreshToken))
                .thenThrow(new CustomException(ErrorCode.INVALID_TOKEN, "리프레시 토큰이 유효하지 않습니다."));

        assertThat(refreshWithRefreshCookie(refreshToken)).isEqualTo(401);
        verify(userRepository, never()).findByEmail(anyString());
    }

    @Test
    @DisplayName("저장된 Refresh Token 의 사용자가 없으면 재발급은 500 이 아니라 401 이다")
    void refreshForMissingUserIsUnauthorized() throws Exception {
        String refreshToken = refreshToken();
        when(tokenService.findByRefreshTokenOrThrow(refreshToken))
                .thenReturn(Token.builder().refreshToken(refreshToken).user(user).build());
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());

        assertThat(refreshWithRefreshCookie(refreshToken)).isEqualTo(401);
    }
}
