package com.example.highteenday_backend.services.security;

import com.example.highteenday_backend.dtos.Login.OAuth2UserInfo;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.enums.Provider;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;

@RequiredArgsConstructor
@Service
@Slf4j
public class CustomOAuth2UserService extends DefaultOAuth2UserService {
    private final UserRepository userRepository;

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
        Optional<User> userOpt = userRepository.findByEmail(oAuth2UserInfo.email());

        User user = userOpt.orElseGet(() -> {
            User guestUser = new User();
            guestUser.setEmail(oAuth2UserInfo.email());
            guestUser.setName(oAuth2UserInfo.name());
            guestUser.setProvider(Provider.valueOf(oAuth2UserInfo.provider().name()));
            return guestUser;
        });

        if (!userOpt.isPresent()) {
            return new CustomUserPrincipal(user, oAuth2UserAttributes, "ROLE_GUEST");
        } else {
            return new CustomUserPrincipal(user, oAuth2UserAttributes, "ROLE_USER");
        }

    }
}