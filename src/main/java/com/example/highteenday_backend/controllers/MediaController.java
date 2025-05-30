package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.services.domain.MediaService;
import com.example.highteenday_backend.services.global.S3Service;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
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
    @PostMapping
    public ResponseEntity<URI> uploadS3(@RequestParam("userId") Long userId,
                                        @RequestParam("file")MultipartFile multipartFile) throws URISyntaxException {
        log.info("userId={} , file={}",userId,multipartFile.getOriginalFilename());
        UploadedResult uploadedResult = s3Service.tmpUpload(userId, multipartFile);
        URI uri = new URI(uploadedResult.getUrl());
        //201 Created 응답, Location 헤더에 url
        return ResponseEntity.created(uri).build();
    }


}
