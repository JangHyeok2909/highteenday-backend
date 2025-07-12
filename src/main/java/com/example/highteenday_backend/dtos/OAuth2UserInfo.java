package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.enums.Provider;
import lombok.Builder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.AuthenticationException;

import java.util.Map;

@Builder
@Slf4j
public record OAuth2UserInfo(
    String name,
    String email,
    Provider provider
){
    public static OAuth2UserInfo of(String registrationId, Map<String, Object> attributes){
        return switch(registrationId){
            case "google" -> ofGoogle(attributes);
            case "kakao" -> ofKakao(attributes);
            case "naver" -> ofNaver(attributes);
            default -> throw new AuthenticationException("지원하지 않는 OAuth 제공자입니다."){};
        };
    }

    private static OAuth2UserInfo ofGoogle(Map<String, Object> attributes){
        return OAuth2UserInfo.builder()
                .name((String) attributes.get("name"))
                .email((String) attributes.get("email"))
                .provider(Provider.GOOGLE)
//                .profile((String) attributes.get("picture"))
                .build();
    }
    private static OAuth2UserInfo ofKakao(Map<String, Object> attributes){
        log.debug("=============================================OAuth2UserInfo 카카오 입장=============================================");
        log.debug("카카오 attributes : " + attributes);
        log.debug("=============================================카카오 퇴장=============================================");

        Map<String, Object> account = (Map<String, Object>) attributes.get("kakao_account");
        Map<String, Object> profile = (Map<String, Object>) account.get("profile");

        return OAuth2UserInfo.builder()
                .name((String) profile.get("nickname"))
                .email((String) account.get("email"))
                .provider(Provider.KAKAO)
//                .profile((String) profile.get("profile_image_url"))
                .build();
    }
    private static OAuth2UserInfo ofNaver(Map<String, Object> attributes){
        log.debug("=============================================OAuth2UserInfo 네이버 입장=============================================");
        log.debug("네이버 attributes : " + attributes);
        log.debug("=============================================네이버 퇴장=============================================");

        Map<String, Object> response = (Map<String, Object>) attributes.get("response");

        return OAuth2UserInfo.builder()
                .name((String) response.get("name"))
                .email((String) response.get("email"))
                .provider(Provider.NAVER)
//                .profile((String) response.get("profile_image"))
                .build();
    }
}