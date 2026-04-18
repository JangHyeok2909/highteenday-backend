package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.dtos.Login.OAuth2UserInfo;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.stereotype.Service;

import java.util.Map;

@RequiredArgsConstructor
@Slf4j
@Service
public class CustomOAuth2UserService extends DefaultOAuth2UserService {
    private final UserService userService;

    //Oauth 로그인 시 자동 호출되는 DefaultOAuth2UserService 메소드
    @Override
    public CustomUserPrincipal loadUser(OAuth2UserRequest request) throws OAuth2AuthenticationException {
        return processOAuthUser(request);
    }

    //oauth2 로그인 요청 처리, 유저 조회후 존재하지 않으면 회원가입+principal 생성 진행
    private CustomUserPrincipal processOAuthUser(OAuth2UserRequest request) {
        //외부 api를 호출하여 oauth provider에서 유저정보를 가져옴.
        Map<String, Object> originalAttributes = super.loadUser(request).getAttributes();
        Map<String, Object> oAuth2UserAttributes = new java.util.HashMap<>(originalAttributes);

        //provider 추출
        String registrationId = request.getClientRegistration().getRegistrationId();
        log.debug("OAuth 로그인 시도. provider={}", registrationId);

        //가져온 유저 email을 통해 DB에 이미 가입된 유저인지 확인
        OAuth2UserInfo oAuth2UserInfo = OAuth2UserInfo.of(registrationId, oAuth2UserAttributes);
        boolean isNew = !userService.existsByEmail(oAuth2UserInfo.email());

        User user;
        //신규라면 회원가입, 존재하면 로그인 처리
        if (isNew) {
            //프로필 이미지 url 추출
            String pictureUrl = (String) oAuth2UserAttributes.get("picture");
            log.info("OAuth2 신규 사용자 자동 등록. provider={}, email={}", registrationId, oAuth2UserInfo.email());
            //email, name, provider 를 가져와 회원가입 진행
            user = userService.registerOAuthUser(
                    oAuth2UserInfo.email(),
                    oAuth2UserInfo.name(),
                    Provider.valueOf(registrationId.toUpperCase()),
                    pictureUrl
            );
        } else {
            log.debug("OAuth2 로그인 성공. provider={}, email={}", registrationId, oAuth2UserInfo.email());
            user = userService.findByEmail(oAuth2UserInfo.email());
        }
        //spring security에서 사용할 principal 객체 생성하여 반환(isNew의 경우 온보딩 처리 시 사용할 트리거)
        return new CustomUserPrincipal(user, oAuth2UserAttributes, isNew);
    }
}
