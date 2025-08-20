package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.enums.MediaOwner;
import com.example.highteenday_backend.services.global.S3Service;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserMediaService {

    private final S3Service s3Service;
    private final MediaService mediaService;
    private final UserRepository userRepository;

    @Transactional
    public void updateProfileImage(User user, String newImage){

        String currentUrl = user.getProfileUrl();
        //기존 이미지 존재하면 삭제
        if (currentUrl != null && !currentUrl.isEmpty()) {
            String pastKey = s3Service.getKeyByUrl(currentUrl);
            s3Service.delete(pastKey);
            mediaService.deleteMediaByUrl(currentUrl);
        }

        if (newImage == null || newImage.isEmpty()) {
            user.setProfileUrl(null); // 기본 프사 변경인데 일단 null 넣음
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
