package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.domain.medias.MediaRepository;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.enums.MediaCategory;
import com.example.highteenday_backend.services.global.S3Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.util.Optional;

@Slf4j
@RequiredArgsConstructor
@Service
public class MediaService {
    private final MediaRepository mediaRepository;

    public Media findByUrl(String url){
        return mediaRepository.findByUrl(url)
                .orElseThrow(()->new RuntimeException("media dose not exists. mediaUrl="+url));
    }
    @Transactional
    public Media createMedia(FileInfo dto){
        Media media = Media.builder()
                .originName(dto.getOriginalFilename())
                .s3Key(dto.getKey())
                .url(dto.getUrl())
                .size(dto.getSize())
                .contentType(dto.getContentType())
                .mediaCategory(getCategory(dto.getContentType()))
                .build();

        return mediaRepository.save(media);
    }
    @Transactional
    public void deleteMediaByUrl(String url){
        Media media = findByUrl(url);
        mediaRepository.delete(media);
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
