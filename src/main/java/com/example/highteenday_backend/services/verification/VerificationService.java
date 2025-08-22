package com.example.highteenday_backend.services.verification;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.verification.StateStore;
import com.example.highteenday_backend.dtos.Verification.OAuthNetTokenResponse;
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import jakarta.transaction.Transactional;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

@RequiredArgsConstructor
@Service
public class VerificationService {
    private static  StateStore stateStore;
    private static RestTemplate restTemplate;
    private static UserRepository userRepository;

    @Value("${oauth.network.key}")
    static String clientId;
    @Value("${oauth.network.secret}")
    static String secretKey;
    @Value("${oauth.network.redirect-url}")
    static String redirectUrl;
    @Value("${oauth.network.scopes}") String scopes;
    @Value("${oauth.network.base-url}")
    static String baseUrl;

    @Data
    public record UserInfoResponse(String email, String phone) {}

    @Transactional
    public String buildAuthRedirectUrl(String returnTo, User user) {
        String state = stateStore.issue(returnTo, user);
        return UriComponentsBuilder.fromHttpUrl(baseUrl)
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUrl)
                .queryParam("response_type", "code")
                .queryParam("scopes", scopes)
                .queryParam("state", state)
                .build(true).toUriString();
    }

    @Transactional
    public String handleCallbackAndGetReturnTo(String code, String state){
        StateStore.Payload payload = stateStore.consume(state);
        String returnTo = payload.returnTo() == null ? "/" : payload.returnTo();

        HttpHeaders tokenHeaders = new HttpHeaders();
        tokenHeaders.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", clientId);
        form.add("client_secret", secretKey);
        form.add("redirect_uri", redirectUrl);
        form.add("code", code);

        OAuthNetTokenResponse token;
        try {
            ResponseEntity<OAuthNetTokenResponse> res = restTemplate.postForEntity(
                    baseUrl, new HttpEntity<>(form, tokenHeaders), OAuthNetTokenResponse.class);
            token = res.getBody();
        } catch (RestClientException e){
            throw new CustomException(ErrorCode.INVALID_REQUEST);
        }

        if(token == null || token.getAccessToken() == null){
            throw new CustomException(ErrorCode.INVALID_REQUEST, "토큰 발급 실패");
        }

        HttpHeaders infoHeaders = new HttpHeaders();
        infoHeaders.setBearerAuth(token.getAccessToken());

        UserInfoResponse info = null;

        try {
            ResponseEntity<UserInfoResponse> infoRes = restTemplate.exchange(
                    baseUrl, HttpMethod.POST, new HttpEntity<>(infoHeaders), UserInfoResponse.class);
            info = infoRes.getBody();
        } catch (RestClientException e) {
            // 사용자 정보가 꼭 필요 없는거 같아서 일단 진행
        }

        final UserInfoResponse infoFinal = info;

        System.out.println("SMS 인증 단계");
        System.out.println("info 값: " + info);
        System.out.println("SMS 인증 종료");

        if(payload.userId() != null){
            userRepository.findById(payload.userId()).ifPresent( u -> {
                if(infoFinal != null){
                    if(infoFinal.phone() != null && !infoFinal.phone().isBlank()){
                        u.setPhoneNum(infoFinal.phone);
                    } else if(infoFinal.email() != null && !infoFinal.email().isBlank()){
                        u.setEmail(infoFinal.email);
                    }

                    u.setPhoneVerified(true);
                    u.setPhoneVerifiedAt(LocalDateTime.now(ZoneId.of("Asia/Seoul")));

                    userRepository.save(u);
                }
            });
        }

        boolean ok = (infoFinal != null && (infoFinal.phone != null || info.email != null));
        String next = UriComponentsBuilder.fromPath(returnTo)
                .queryParam("verification", ok? "ok" :  "unknown")
                .build(true).toUriString();

        return next;
    }

}
