package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.UpdateProfileImageDto;
import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.UserMediaService;
import com.example.highteenday_backend.services.domain.UserService;
import com.example.highteenday_backend.services.global.S3Service;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.net.URISyntaxException;


@Tag(name = "이미지 API", description = "이미지를 전달하고 이미지를 조회하는 url을 반환 받음.")
@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/media")
public class MediaController {
    private final S3Service s3Service;
    private final UserMediaService userMediaService;
    private final UserService userService;

    @Operation(summary = "이미지 임시 업로드", description = "S3 tmp 경로에 업로드 후 임시 URL 반환. 이후 profile-image API로 확정 저장 필요.")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<URI> uploadS3(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                        @RequestParam("file") MultipartFile multipartFile) throws URISyntaxException {
        User user = userPrincipal.getUser();
        log.info("userId={} , file={}", user.getId(), multipartFile.getOriginalFilename());
        UploadedResult uploadedResult = s3Service.tmpUpload(user.getId(), multipartFile);
        URI uri = new URI(uploadedResult.getUrl());
        return ResponseEntity.created(uri).build();
    }

    @Operation(summary = "프로필 이미지 변경", description = "임시 업로드된 URL을 전달하면 최종 위치로 이동 후 프로필 이미지로 저장. url을 null 또는 빈 값으로 전달하면 프로필 이미지 제거.")
    @PatchMapping("/profile-image")
    public ResponseEntity<?> updateProfileImage(
            @AuthenticationPrincipal CustomUserPrincipal userPrincipal,
            @RequestBody UpdateProfileImageDto dto
    ) {
        User user = userService.findById(userPrincipal.getUser().getId());
        userMediaService.updateProfileImage(user, dto.url());
        return ResponseEntity.ok("프로필 이미지 변경 완료");
    }
}
