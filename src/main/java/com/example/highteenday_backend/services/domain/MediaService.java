package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.domain.medias.MediaRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.enums.MediaCategory;
import com.example.highteenday_backend.services.global.S3Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@RequiredArgsConstructor
@Service
public class MediaService {
    private final MediaRepository mediaRepository;
    private final S3Service s3Service;

    @Transactional
    public URI uploadS3andSave(MultipartFile multipartFile){
        UploadedResult uploadedResult = s3Service.upload(multipartFile);
        String fileName = uploadedResult.getFileName();
        String url = uploadedResult.getUrl();
        String originalFilename = multipartFile.getOriginalFilename();
        String contentType = multipartFile.getContentType();

        Media media = Media.builder()
                .originName(originalFilename)
                .s3Name(fileName)
                .url(url)
                .size(multipartFile.getSize())
                .contentType(contentType)
                .mediaCategory(getCategory(contentType))
                .build();

        mediaRepository.save(media);
        return URI.create(url);
    }

    //로그 찍기
    @Transactional
    public List<Media> linkMediaToPostByUrls(List<String> urls, Post post){
        List<Media> mediaList = new ArrayList<>();
        for(String url : urls){
            Media media = mediaRepository.findByUrl(url)
                    .orElseThrow(() -> new RuntimeException("media does not exists, url = " + url));
            media.setPost(post);
            mediaList.add(media);
        }
        return mediaList;
    }



    private MediaCategory getCategory(String contentType){
        if(contentType.startsWith("image")){
            if(contentType.equals("image/gif")) return MediaCategory.GIF;
            return MediaCategory.IMG;
        } else if(contentType.startsWith("video")){
            return MediaCategory.VIDEO;
        } else {
            throw new IllegalArgumentException("content type is not supported, contentType = "+contentType);
        }

    }
}
