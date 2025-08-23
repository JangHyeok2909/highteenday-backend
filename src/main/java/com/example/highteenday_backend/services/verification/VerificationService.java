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
import lombok.extern.slf4j.Slf4j;
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
@Slf4j
public class VerificationService {
    private final StateStore stateStore;
    private final RestTemplate restTemplate;
    private final UserRepository userRepository;

    @Value("${oauth.network.key}")
    String clientId;
    @Value("${oauth.network.secret}")
    String secretKey;
    @Value("${oauth.network.redirect-url}")
    String redirectUrl;
    @Value("${oauth.network.scopes}") String scopes;
    @Value("${oauth.network.base-url}")
    String baseUrl;

    public record UserInfoResponse(String email, String phone) {}

    @Transactional
    public String buildAuthRedirectUrl(String returnTo, User user) {
        String state = stateStore.issue(returnTo, user);

        System.out.println("문제 없습니다");
        System.out.println("Client_id : " + clientId);
        System.out.println("redirect_uri : " + redirectUrl);
        System.out.println("base_url : " + baseUrl);

        return UriComponentsBuilder.fromHttpUrl(baseUrl)
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUrl)
                .queryParam("response_type", "code")
                .queryParam("scopes", scopes)
                .queryParam("state", state)
                .build(true).toUriString();
    }

    @Transactional
    public String handleCallbackAndGetReturnTo(String code, String state, String error, String errorDesc){
        System.out.println("state 값: " + state);
        System.out.println("state 값: " + state);
        System.out.println("state 값: " + state);
        System.out.println("code 값: " + code);
        System.out.println("code 값: " + code);
        System.out.println("code 값: " + code);

        StateStore.Payload payload = stateStore.consume(state);
        String returnTo = payload.returnTo() == null ? "/" : payload.returnTo();

        if(error != null || code == null || code.isBlank() ){
            System.out.println("error, code 부분 진입");
            System.out.println("error : " + error);
            System.out.println("error_Description : " + errorDesc);
            System.out.println("code : " + code);
            String next = UriComponentsBuilder.fromPath("/NotFound").build(true).toUriString();
            return next;
        }

        HttpHeaders tokenHeaders = new HttpHeaders();
        tokenHeaders.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", clientId);
        form.add("redirect_uri", redirectUrl);
        form.add("code", code);
        form.add("client_secret", secretKey);

        OAuthNetTokenResponse token;
        try {
            ResponseEntity<OAuthNetTokenResponse> res = restTemplate.postForEntity(
                    baseUrl, new HttpEntity<>(form, tokenHeaders), OAuthNetTokenResponse.class);
            token = res.getBody();
        } catch (RestClientException e){

            System.out.println("Call Back 부분에서 에러 터짐요");
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
