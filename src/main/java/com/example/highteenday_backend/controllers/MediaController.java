package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.security.CustomUserPrincipal;
import com.example.highteenday_backend.services.domain.MediaService;
import com.example.highteenday_backend.services.global.S3Service;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
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
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<URI> uploadS3(@AuthenticationPrincipal CustomUserPrincipal userPrincipal,
                                        @RequestParam("file")MultipartFile multipartFile) throws URISyntaxException {
        User user = userPrincipal.getUser();
        log.info("userId={} , file={}",user.getId(),multipartFile.getOriginalFilename());
        UploadedResult uploadedResult = s3Service.tmpUpload(user.getId(), multipartFile);
        URI uri = new URI(uploadedResult.getUrl());
        //201 Created 응답, Location 헤더에 url
        return ResponseEntity.created(uri).build();
    }


}
