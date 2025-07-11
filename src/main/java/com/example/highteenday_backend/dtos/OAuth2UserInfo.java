package com.example.highteenday_backend.dtos;

import lombok.Builder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.AuthenticationException;

import java.util.Map;

@Builder
@Slf4j
public record OAuth2UserInfo(
    String name,
    String email
//    String profile
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
//                .profile((String) attributes.get("picture"))
                .build();
    }
    private static OAuth2UserInfo ofKakao(Map<String, Object> attributes){
        System.out.println("=============================================OAuth2UserInfo 카카오 입장=============================================");
        log.info("=============================================OAuth2UserInfo 카카오 입장=============================================");
        System.out.println("");
        System.out.println("");
        System.out.println("");
        System.out.println("카카오 attributes : " + attributes);
        System.out.println("");
        System.out.println("");
        System.out.println("");
        System.out.println("=============================================카카오 퇴장=============================================");
        log.info("=============================================카카오 퇴장=============================================");
        Map<String, Object> account = (Map<String, Object>) attributes.get("kakao_account");
        Map<String, Object> profile = (Map<String, Object>) account.get("profile");

        return OAuth2UserInfo.builder()
                .name((String) profile.get("nickname"))
                .email((String) account.get("email"))
//                .profile((String) profile.get("profile_image_url"))
                .build();
    }
    private static OAuth2UserInfo ofNaver(Map<String, Object> attributes){
        System.out.println("=============================================OAuth2UserInfo 네이버 입장=============================================");
        log.info("=============================================OAuth2UserInfo 네이버 입장=============================================");
        System.out.println("");
        System.out.println("");
        System.out.println("");
        System.out.println("네이버 attributes : " + attributes);
        System.out.println("");
        System.out.println("");
        System.out.println("");
        System.out.println("=============================================네이버 퇴장=============================================");
        log.info("=============================================네이버 퇴장=============================================");

        Map<String, Object> response = (Map<String, Object>) attributes.get("response");

        return OAuth2UserInfo.builder()
                .name((String) response.get("name"))
                .email((String) response.get("email"))
//                .profile((String) response.get("profile_image"))
                .build();
    }
}