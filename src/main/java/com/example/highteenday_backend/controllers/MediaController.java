package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.services.domain.MediaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;

@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/media")
public class MediaController {
    private final MediaService mediaService;
    @PostMapping
    public ResponseEntity<URI> createMedia(@RequestParam("userId") Long userId,
                                           @RequestParam("file")MultipartFile multipartFile){

        log.info("userId="+userId);
        log.info("file="+multipartFile.getOriginalFilename());
        URI url = mediaService.uploadS3andSave(userId,multipartFile);
        //201 Created 응답, Location 헤더에 url
        return ResponseEntity.created(url).build();
    }


}
