package com.example.highteenday_backend.services.domain;


import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.enums.MediaOwner;
import com.example.highteenday_backend.services.global.S3Service;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@RequiredArgsConstructor
@Service
public class CommentMediaService {
    private final S3Service s3Service;
    private final MediaService mediaService;

    @Transactional
    public void processCreateCommentMedia(Long userId, Comment comment, RequestCommentDto dto){
        String finalUrl = s3Service.copyToFinalLocation(dto.getUrl(), comment.getId(), MediaOwner.COMMENT);
        comment.updateImage(finalUrl);

        String key = s3Service.getKeyByUrl(finalUrl);
        FileInfo fileInfo = s3Service.getFileInfo(key);
        Media media = mediaService.createMedia(fileInfo);

        media.setComment(comment);
        s3Service.deleteUserTmp(userId);
    }

    @Transactional
    public void processUpdateCommentMedia(Long userId, Comment comment, RequestCommentDto dto){
        if (dto.getUrl().isEmpty()){ //이미지 삭제
            String deleteUrl = comment.getS3Url();

            String deleteKey = s3Service.getKeyByUrl(deleteUrl);
            s3Service.delete(deleteKey);
            mediaService.deleteMediaByUrl(deleteUrl);

            comment.updateImage(null);

        } else if(!dto.getUrl().equals(comment.getS3Url())) { //이미지 업데이트
            String finalUrl = s3Service.copyToFinalLocation(dto.getUrl(), comment.getId(), MediaOwner.COMMENT);
            //새로운 s3 저장,기존+tmp s3 삭제
            s3Service.deleteUserTmp(userId);
            String pastKey = s3Service.getKeyByUrl(comment.getS3Url());
            s3Service.delete(pastKey);
            //새로운 media 저장, 기존 media 삭제
            mediaService.deleteMediaByUrl(comment.getS3Url());
            String newKey = s3Service.getKeyByUrl(finalUrl);
            FileInfo newFileInfo = s3Service.getFileInfo(newKey);
            Media media = mediaService.createMedia(newFileInfo);
            media.setComment(comment);
            //comment의 url 변경
            comment.updateImage(finalUrl);
        }

    }
}
