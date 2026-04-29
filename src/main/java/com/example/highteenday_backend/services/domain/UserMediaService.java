package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.enums.MediaOwner;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.global.S3Service;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.crossstore.ChangeSetPersister;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class UserMediaService {

    private final S3Service s3Service;
    private final MediaService mediaService;

    private static final String BUCKET_NAME = "highteenday-bucket-0906";


    @Transactional
    public void updateProfileImage(User user, String newImage){
        String currentUrl = user.getProfileUrl();
        //기존 s3 이미지 존재하면 삭제. ouath 제공 기본이미지의 경우엔 삭제없음.
        if(isS3Url(currentUrl)){
            deleteOldS3Image(currentUrl);
        }
        // 변경할 프로필 없으면 그냥 기본프로필 사용
        if (newImage == null || newImage.isEmpty()) {
            user.setProfileUrl(null);
            return;
        }
        //이미지 업데이트
        Map<String, String> urlKey = copyToFinalAndDeleteTmp(currentUrl, user.getId());

        String finalUrl = urlKey.get("url");
        String newKey = urlKey.get("key");

        FileInfo newFileInfo = s3Service.getFileInfo(newKey);

        updateUserProfileAndCreateMedia(user,finalUrl,newFileInfo);
    }
    public boolean isS3Url(String url) {
        return url != null && url.contains(BUCKET_NAME);
    }

    public void deleteOldS3Image(String currentUrl) {

        try {
            String pastKey = s3Service.getKeyByUrl(currentUrl);
            s3Service.delete(pastKey);
            mediaService.deleteMediaByUrl(currentUrl);
        } catch (ResourceNotFoundException e) {}

    }
    //final 경로로 업로드하고 tmp 모두 삭제함.
    public Map<String,String> copyToFinalAndDeleteTmp(String url, Long userId){
        String finalUrl = s3Service.copyToFinalLocation(url, userId, MediaOwner.PROFILE);
        String key = s3Service.getKeyByUrl(finalUrl);
        s3Service.deleteUserTmp(userId);
        return Map.of("url",finalUrl, "key" ,key);
    }
    // 최종 s3 url을 통해 user의 profile update, create media를 DB에 반영.
    public void updateUserProfileAndCreateMedia(User user, String finalUrl, FileInfo newFileInfo){
        Media media = mediaService.createMedia(newFileInfo);
        media.setProfileOwner(user);
        user.setProfileUrl(finalUrl);
    }

}
