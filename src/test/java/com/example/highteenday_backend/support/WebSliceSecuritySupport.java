package com.example.highteenday_backend.support;

import com.example.highteenday_backend.security.OAuth2SuccessHandler;
import com.example.highteenday_backend.security.TokenProvider;
import com.example.highteenday_backend.services.security.CustomOAuth2UserService;
import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * 웹 슬라이스 테스트에서 {@code SecurityConfig} 를 띄우기 위한 최소 협력자 묶음.
 *
 * {@code @WebMvcTest} 는 {@code SecurityFilterChain} 빈을 기본 포함하므로
 * {@code SecurityConfig} 가 컨텍스트에 올라오고, 그 필드 주입 대상 세 개가 없으면
 * 컨텍스트가 뜨지 않는다. 셋 다 인가 규칙 판정에는 관여하지 않는다 —
 * OAuth2 로그인 시작·콜백 경로에서만 쓰인다. 그래서 목으로 채운다.
 */
@TestConfiguration
public class WebSliceSecuritySupport {

    @Bean
    CustomOAuth2UserService customOAuth2UserService() {
        return Mockito.mock(CustomOAuth2UserService.class);
    }

    @Bean
    OAuth2SuccessHandler oAuth2SuccessHandler() {
        return Mockito.mock(OAuth2SuccessHandler.class);
    }

    @Bean
    TokenProvider tokenProvider() {
        return Mockito.mock(TokenProvider.class);
    }
}
