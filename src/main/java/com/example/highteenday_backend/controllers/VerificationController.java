package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.UserService;
import com.example.highteenday_backend.services.verification.VerificationService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name ="SMS/Email 인증 API")
@RequiredArgsConstructor
@RequestMapping("/api/verification")
@RestController
public class VerificationController {
    private final VerificationService verificationService;
    private final UserService userService;

    // 돌아갈 주소를 쿼리로 받을 예정
    // ex) /api/verification/oauth-net/start?returnTo=/signup
    /** 휴대폰, 이메일 인증  **/
    @GetMapping("/oauth-net/start")
    public ResponseEntity<?> sendSignUpPhone(
            @AuthenticationPrincipal CustomUserPrincipal user,
            @RequestParam String returnTo
    ){
        userService.findByEmail(user.getUser().getEmail());

        String url = verificationService.buildAuthRedirectUrl(returnTo, user.getUser());

        return ResponseEntity.status(302).header("Location", url).build();
    }

    // 인증 후 돌아오는 위치
    @GetMapping("/oauth-net/callback")
    public ResponseEntity<?> oauthNetCallback(
            @RequestParam String code,
            @RequestParam String state
    ){
        String returnTo = VerificationService.handleCallbackAndGetReturnTo(code, state);

        return ResponseEntity.status(302).header("Location", returnTo).build();
    }
}
