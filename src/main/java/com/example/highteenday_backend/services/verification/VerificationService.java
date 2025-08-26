package com.example.highteenday_backend.services.verification;

import com.example.highteenday_backend.services.global.RedisService;
import net.nurigo.sdk.NurigoApp;
import net.nurigo.sdk.message.exception.NurigoMessageNotReceivedException;
import net.nurigo.sdk.message.model.Message;
import net.nurigo.sdk.message.service.DefaultMessageService;
import com.example.highteenday_backend.dtos.Verification.VerifyCodeDto;

import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Random;

@RequiredArgsConstructor
@Service
@Slf4j
public class VerificationService {
    private final RedisService redisService;


    @Value("${cool-sms.key}")
    String clientId;
    @Value("${cool-sms.secret}")
    String secretKey;
    @Value("${cool-sms.from-phone-num}")
    String fromPhoneNum;

    private String generateVerificationCode() {
        Random random = new Random();
        int code = 100000 + random.nextInt(900000);
        return String.valueOf(code);
    }

    @Transactional
    public HashMap<String, String> sendSmsSendGenerateCode(String phoneNum) {

        HashMap<String, String> hm = new HashMap<>();
        String verifyCode = generateVerificationCode();

        String key = "verify:SMS:" + phoneNum;
        Boolean created = redisService.setIfAbsentSeconds(key, verifyCode);
        if (Boolean.FALSE.equals(created)) {
            hm.put("data", "중복");

            return hm;
        }


        // 문자 보내는 부분
        DefaultMessageService messageService =  NurigoApp.INSTANCE.initialize(clientId, secretKey, "https://api.solapi.com");
        Message message = new Message();
        message.setFrom(fromPhoneNum);
        message.setTo(phoneNum);
        message.setText("본인확인 인증번호는 (" + verifyCode + ") 입니다.");

        try{
            messageService.send(message);
        } catch(NurigoMessageNotReceivedException e){
            System.out.println("Nurigo 1 : " + e.getFailedMessageList());
            System.out.println("Nurigo 2 : " + e.getMessage());
            hm.put("data", "NurigoMessageNotReceivedException");
            return hm;
        } catch (Exception e) {
            System.out.println("Nurigo 3 : " + e.getMessage());
            hm.put("data", "Exception");
            return hm;
        }
        hm.put("data", "전송 성공");
        return hm;
    }

    @Transactional
    public HashMap<String, String> verifyCode(VerifyCodeDto verifyCodeDto){
        HashMap<String, String> hm = new HashMap<>();
        String key = "verify:SMS:" + verifyCodeDto.phoneNum();
        String code = verifyCodeDto.verifyCode();
        String saved = redisService.getValue(key).toString();

        if (saved == null) {
            hm.put("data", "expired_or_not_found_code");
            return hm;
        } else if (!saved.equals(code)) {
            hm.put("data", "incorrect_code");
            return hm;
        } else {
            redisService.delete(key);
            hm.put("data", "correct_code");
        }

        return hm;
    }

}
