package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.UserService;
import com.example.highteenday_backend.services.verification.VerificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
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
    @Operation(
            summary = "인증 시작 (302 Redirect)",
            description = "현재 로그인된 사용자를 기반으로 외부 인증 사이트로 **302** 리다이렉트합니다. "
                    + "`returnTo`는 인증 완료 후 다시 돌아올 프론트 경로(또는 절대경로)입니다."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "302", description = "인증 사이트로 리다이렉트",
                    headers = {
                            @Header(name = "Location", description = "리다이렉트될 외부 인증 URL",
                                    schema = @Schema(type = "string"))
                    }
            ),
            @ApiResponse(responseCode = "401", description = "인증 필요"),
            @ApiResponse(responseCode = "404", description = "사용자 없음")
    })
    @GetMapping("/oauth-net/start")
    public ResponseEntity<?> sendSignUpPhone(
            @Parameter(hidden = true) // Swagger 화면에서 노출 안 함
            @AuthenticationPrincipal CustomUserPrincipal user,
            @Parameter(description = "인증 완료 후 돌아올 경로", example = "/signup", required = true)
            @RequestParam String returnTo
    ){
        userService.findByEmail(user.getUser().getEmail());

        String url = verificationService.buildAuthRedirectUrl(returnTo, user.getUser());
        return ResponseEntity.status(302).header("Location", url).build();
    }

    @Operation(
            summary = "인증 콜백 (302 Redirect)",
            description = "외부 인증이 완료되면 이 엔드포인트로 돌아옵니다. "
                    + "`code`, `state`를 검증/처리한 뒤 원래 페이지(`returnTo`)로 **302** 리다이렉트합니다."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "302", description = "원래 페이지로 리다이렉트",
                    headers = {
                            @Header(name = "Location", description = "리다이렉트될 returnTo 경로",
                                    schema = @Schema(type = "string"))
                    }
            ),
            @ApiResponse(responseCode = "400", description = "유효하지 않은 code/state")
    })
    @GetMapping("/oauth-net/callback")
    public ResponseEntity<?> oauthNetCallback(
            @Parameter(description = "외부 인증 서버가 내려주는 코드", example = "AUTH_CODE_123", required = true)
            @RequestParam String code,
            @Parameter(description = "CSRF 방지를 위한 상태 값", example = "state_nonce_abc", required = true)
            @RequestParam String state
    ){
        String returnTo = verificationService.handleCallbackAndGetReturnTo(code, state);
        return ResponseEntity.status(302).header("Location", returnTo).build();
    }
}
