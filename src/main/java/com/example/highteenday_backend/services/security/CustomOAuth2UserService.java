package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.dtos.OAuth2UserInfo;
import com.example.highteenday_backend.domain.users.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Map;

@Service
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

//    @Autowired
//    private UserRepository userRepository;
//
//    @Override
//    public OAuth2User loadUser(OAuth2UserRequest request) throws OAuth2AuthenticationException {
//        // 구글, 카카오 에서 받아온 사용자 정보 load
//        Map<String, Object> oAuth2UserAttributes = super.loadUser(request).getAttributes();
//
//        // 카카오인지 구글인지 id 들고오기
//        String registrationId = request.getClientRegistration().getRegistrationId();
//
//        String userNameAttributeName = request
//                .getClientRegistration()
//                .getProviderDetails()
//                .getUserInfoEndpoint()
//                .getUserNameAttributeName();
//
//        OAuth2UserInfo oAuth2UserInfo = OAuth2UserInfo.of(registrationId, oAuth2UserAttributes);
//
//        oAuth2UserAttributes.put("registrationId", registrationId);
//        oAuth2UserAttributes.put("parsed_email", oAuth2UserInfo.email());
//
//        return new DefaultOAuth2User(
//                Collections.singleton(new SimpleGrantedAuthority("USER")),
//                oAuth2UserAttributes,
//                "parsed_email"
//        );
//    }
}
