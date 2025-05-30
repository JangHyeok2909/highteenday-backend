package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.Utils.MediaUtils;
import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.enums.MediaOwner;
import com.example.highteenday_backend.services.global.S3Service;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@RequiredArgsConstructor
@Service
public class PostMediaService {
    private final S3Service s3Service;
    private final MediaService mediaService;

    @Transactional
    public void processPostMedia(Long userId, Post post){
        List<String> urls = MediaUtils.extractS3Urls(post.getContent());
        if(!urls.isEmpty()){
            List<Media> mediaList =new ArrayList<>();
            String replaceUrlContent= post.getContent();
            //파싱 된 urls를 통해 tmp에 저장한 이미지를 post-file로 복사
            //post-file의 postFileUrl 가져와서 content의 기존 url 대체
            //media 저장
            for(String u : urls){
                String postFileUrl = s3Service.copyToFinalLocation(u,post.getId(), MediaOwner.POST);
                FileInfo fileInfo = s3Service.getFileInfo(s3Service.getKeyByUrl(postFileUrl));
                mediaList.add(mediaService.createMedia(fileInfo));
                replaceUrlContent = replaceUrlContent.replace(u,postFileUrl);
            }
            //url이 대체된 content를 post에 저장, mediaList에 post 매핑
            post.updateContent(replaceUrlContent);

            for(Media m:mediaList){
                m.setPost(post);
            }
            //유저의 tmp 전부 삭제
            s3Service.deleteUserTmp(userId);
        }
    }
}
