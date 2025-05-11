package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.services.domain.MediaService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;

@RequiredArgsConstructor
@RestController
@RequestMapping("/api/media")
public class MediaController {
    private final MediaService mediaService;
    @PostMapping
    public ResponseEntity<URI> createMedia(@RequestParam("file")MultipartFile multipartFile){
        URI url = mediaService.save(multipartFile);
        return ResponseEntity.ok(url);
    }
}
