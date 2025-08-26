package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.dtos.Verification.VerifyCodeDto;
import com.example.highteenday_backend.services.domain.UserService;
import com.example.highteenday_backend.services.verification.VerificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;

@Tag(name ="SMS/Email 인증 API")
@RequiredArgsConstructor
@RequestMapping("/api/verification")
@RestController
public class VerificationController {
    private final VerificationService verificationService;

    @Operation(
            summary = "인증 시작",
            description = "start 호출 시, 사용자 휴대폰으로 인증번호 문자를 전송합니다 "
    )
    @PostMapping("/cool-sms/start")
    public HashMap<String, String> sendMessagePhone(
            @RequestBody String userPhoneNum
    ){
        HashMap<String, String> hm = new HashMap<>();
        try{
            hm = verificationService.sendSmsSendGenerateCode(userPhoneNum);
            hm.put("sendSMS", "true");
        } catch (Exception e){
            hm.put("sendSMS", "false");
        }

        return hm;
    }

    @Operation(
            summary = "인증 검증",
            description = "verify 호출 시, 인증번호 검증을 합니다."
    )
    @PostMapping("/cool-sms/verify")
    public HashMap<String, String>  verificationCode(
            @RequestBody VerifyCodeDto verifyCodeDto
    ){
        return verificationService.verifyCode(verifyCodeDto);
    }

}
