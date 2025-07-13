package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.dtos.OAuth2UserInfo;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.fasterxml.jackson.databind.jsonFormatVisitors.JsonFormatTypes;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.security.AuthProvider;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;

@Service
@Slf4j
public class CustomOAuth2UserService extends DefaultOAuth2UserService {

    @Autowired
    private UserRepository userRepository;

    @Override
    public CustomUserPrincipal loadUser(OAuth2UserRequest request) throws OAuth2AuthenticationException {
        // 구글, 카카오 에서 받아온 사용자 정보 load
        Map<String, Object> originalAttributes = super.loadUser(request).getAttributes(); // << 수정 불가능한(UnmodifibaleMap) Map 이다
        Map<String, Object> oAuth2UserAttributes = new java.util.HashMap<>(originalAttributes);

        // 카카오인지 구글인지 id 들고오기
        String registrationId = request.getClientRegistration().getRegistrationId();
        log.debug("==== [OAuth 로그인 시도] registrationId = { " + registrationId + " } ====");
        System.out.println("==== [OAuth 로그인 시도] registrationId = { " + registrationId + " } ====");


        OAuth2UserInfo oAuth2UserInfo = OAuth2UserInfo.of(registrationId, oAuth2UserAttributes); // dto 호출

        User user = userRepository.findByEmail(oAuth2UserInfo.email())
                .orElseGet(() -> {
                    User guestUser = new User();
                    guestUser.setEmail(oAuth2UserInfo.email());
                    guestUser.setName(oAuth2UserInfo.name());
                    guestUser.setProvider(Provider.valueOf(oAuth2UserInfo.provider().name()));
                    return guestUser;
                });

        Optional<User> userOpt = userRepository.findByEmail(oAuth2UserInfo.email());
        if (!userOpt.isPresent()) {
            User guestUser = new User();
            guestUser.setEmail(oAuth2UserInfo.email());
            guestUser.setName(oAuth2UserInfo.name());
            guestUser.setProvider(Provider.valueOf(oAuth2UserInfo.provider().name()));

            return new CustomUserPrincipal(user, oAuth2UserAttributes, "ROLE_GUEST");
        } else {
            return new CustomUserPrincipal(user, oAuth2UserAttributes, "ROLE_USER");
        }



//        oAuth2UserAttributes.put("registrationId", registrationId);
//        oAuth2UserAttributes.put("parsed_email", oAuth2UserInfo.email());
//        oAuth2UserAttributes.put("name", oAuth2UserInfo.name());
//
//        Optional<User> userOpt = userRepository.findByEmail(oAuth2UserInfo.email());
//
//        if(!userOpt.isPresent()){
//            return new DefaultOAuth2User(
//                    Collections.singleton(new SimpleGrantedAuthority("ROLE_GUEST")),
//                    oAuth2UserAttributes,
//                    "parsed_email"
//            );
//        }
//
//        return new DefaultOAuth2User(
//                Collections.singleton(new SimpleGrantedAuthority("ROLE_USER")),
//                oAuth2UserAttributes,
//                "parsed_email"
//        );
//    }

    }
}