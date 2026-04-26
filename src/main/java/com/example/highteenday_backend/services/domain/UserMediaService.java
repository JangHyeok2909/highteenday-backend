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

@Service
@RequiredArgsConstructor
public class UserMediaService {

    private final S3Service s3Service;
    private final MediaService mediaService;

    @Transactional
    public void updateProfileImage(User user, String newImage){

        String currentUrl = user.getProfileUrl();
        //기존 이미지 존재하면 삭제. 구글 기본 이미지의 경우엔 무시
        if (currentUrl != null && !currentUrl.isEmpty()) {
            try {
                String pastKey = s3Service.getKeyByUrl(currentUrl);
                s3Service.delete(pastKey);
                mediaService.deleteMediaByUrl(currentUrl);
            } catch (ResourceNotFoundException e){}
        }
        // 변경할 프로필 없으면 그냥 기본프로필 사용
        if (newImage == null || newImage.isEmpty()) {
            user.setProfileUrl(null);
            return;
        }
        //이미지 업데이트
        String finalUrl = s3Service.copyToFinalLocation(newImage, user.getId(), MediaOwner.PROFILE);
        String newKey = s3Service.getKeyByUrl(finalUrl);
        FileInfo newFileInfo = s3Service.getFileInfo(newKey);
        Media media = mediaService.createMedia(newFileInfo);
        media.setProfileOwner(user);
        user.setProfileUrl(finalUrl);
    }

}
