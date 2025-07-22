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
    public void processCreatePostMedia(Long userId, Post post){
        List<String> urls = MediaUtils.extractS3Urls(post.getContent());
        if(!urls.isEmpty()){
            List<Media> mediaList =new ArrayList<>();
            String replaceUrlContent= post.getContent();
            //파싱 된 urls를 통해 tmp에 저장한 이미지를 post-file로 복사
            //post-file의 postFileUrl 가져와서 content의 tmp url 대체
            //media 저장
            for(String u : urls){
                String postFileUrl = s3Service.copyToFinalLocation(u,post.getId(), MediaOwner.POST);
                FileInfo fileInfo = s3Service.getFileInfo(s3Service.getKeyByUrl(postFileUrl));
                mediaList.add(mediaService.createMedia(fileInfo));
                replaceUrlContent = replaceUrlContent.replace(u,postFileUrl);
            }
            //post-file url로 대체된 content를 post에 저장, mediaList에 post 매핑
            post.updateContent(replaceUrlContent);

            for(Media m:mediaList){
                m.setPost(post);
            }
            //유저의 tmp 전부 삭제
            s3Service.deleteUserTmp(userId);
        }
    }
    @Transactional
    public void processUpdatePostMedia(Long userId, Post post,String newContent,String oldContent){
        List<String> newUrls = MediaUtils.extractS3Urls(newContent);
        List<String> oldUrls = MediaUtils.extractS3Urls(oldContent);
//        System.out.println("newUrls = "+newUrls);
//        System.out.println("oldUrls = "+oldUrls);
        List<String> addedUrls = new ArrayList<>(newUrls);
        List<String> removedUrls = new ArrayList<>(oldUrls);
        addedUrls.removeAll(oldUrls); //추가&변경된 urls
        removedUrls.removeAll(newUrls); //삭제된 urls
        if(newUrls.isEmpty()) {
            post.updateContent(newContent);
            return;
        }

        if(!addedUrls.isEmpty()){ //이미지 변경됨
            List<Media> mediaList =new ArrayList<>();
            String replaceUrlContent= newContent;
            //파싱 된 urls를 통해 tmp에 저장한 이미지를 post-file로 복사
            //post-file의 postFileUrl 가져와서 content의 tmp url 대체
            //media 저장
            for(String u : addedUrls){
                String postFileUrl = s3Service.copyToFinalLocation(u,post.getId(), MediaOwner.POST);
//                System.out.println("change to postFileUrl = "+postFileUrl);
                FileInfo fileInfo = s3Service.getFileInfo(s3Service.getKeyByUrl(postFileUrl));
                mediaList.add(mediaService.createMedia(fileInfo));
                replaceUrlContent = replaceUrlContent.replace(u,postFileUrl);
            }
//            System.out.println("replaceUrlContent = "+replaceUrlContent);
            //post-file url로 대체된 content를 post에 저장, mediaList에 post 매핑
            post.updateContent(replaceUrlContent);

            for(Media m:mediaList){
                m.setPost(post);
            }
            //유저의 tmp 전부 삭제
            s3Service.deleteUserTmp(userId);
            //삭제된 이미지 s3에서 제거
            for(String ru:removedUrls){
                s3Service.delete(s3Service.getKeyByUrl(ru));
            }

        }
    }
}
