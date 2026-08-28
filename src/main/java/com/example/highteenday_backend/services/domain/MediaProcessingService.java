package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.utils.MediaUtils;
import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.enums.MediaOwner;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.global.FileStoragePort;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

@Service
@RequiredArgsConstructor
public class MediaProcessingService {

    private final FileStoragePort fileStorage;
    private final MediaService mediaService;
    private final UserService userService;

    // ── Post ──────────────────────────────────────────────────────────────

    @Transactional
    public void processCreatePostMedia(Long userId, Post post) {
        List<String> urls = MediaUtils.extractS3Urls(post.getContent());
        if (urls.isEmpty()) return;

        String replaceUrlContent = post.getContent();
        for (String u : urls) {
            String postFileUrl = fileStorage.copyToFinalLocation(u, post.getId(), MediaOwner.POST);
            createFromFinalUrl(postFileUrl, m -> m.setPost(post));
            replaceUrlContent = replaceUrlContent.replace(u, postFileUrl);
        }
        post.editContent(replaceUrlContent);
        // 이 글이 실제로 승격시킨 임시 파일만 지운다. 사용자의 tmp/ 전체를 지우면
        // 탭 두 개로 동시에 쓰던 다른 글의 이미지까지 날아간다 (KI-36).
        fileStorage.deletePromotedTmpFiles(urls);
    }

    @Transactional
    public void processUpdatePostMedia(Long userId, Post post, String newContent, String oldContent) {
        List<String> newUrls = MediaUtils.extractS3Urls(newContent);
        List<String> oldUrls = MediaUtils.extractS3Urls(oldContent);
        List<String> addedUrls = new ArrayList<>(newUrls);
        List<String> removedUrls = new ArrayList<>(oldUrls);
        addedUrls.removeAll(oldUrls);
        removedUrls.removeAll(newUrls);

        if (newUrls.isEmpty()) {
            post.editContent(newContent);
            return;
        }

        if (!addedUrls.isEmpty()) {
            String replaceUrlContent = newContent;
            for (String u : addedUrls) {
                String postFileUrl = fileStorage.copyToFinalLocation(u, post.getId(), MediaOwner.POST);
                createFromFinalUrl(postFileUrl, m -> m.setPost(post));
                replaceUrlContent = replaceUrlContent.replace(u, postFileUrl);
            }
            post.editContent(replaceUrlContent);
            fileStorage.deletePromotedTmpFiles(addedUrls);
            for (String ru : removedUrls) {
                fileStorage.deleteByUrl(ru);
            }
        } else {
            post.editContent(newContent);
        }
    }

    // ── Comment ───────────────────────────────────────────────────────────

    @Transactional
    public void processCreateCommentMedia(Long userId, Comment comment, RequestCommentDto dto) {
        if (dto.getUrl() == null || dto.getUrl().isEmpty()) return;
        Media media = processAndLink(dto.getUrl(), comment.getId(), MediaOwner.COMMENT,
                m -> m.setComment(comment));
        comment.changeImage(media.getUrl());
        fileStorage.deletePromotedTmpFiles(List.of(dto.getUrl()));
    }

    @Transactional
    public void processUpdateCommentMedia(Comment comment, RequestCommentDto dto) {
        // 이미지 없이 작성된 댓글은 s3Url이 null이다. null 체크 없이 isEmpty()를 부르면
        // 텍스트만 있는 댓글의 내용 수정이 전부 NPE로 죽는다.
        String currentUrl = comment.getS3Url();
        if (dto.getUrl() == null || dto.getUrl().isEmpty()) {
            if (currentUrl != null && !currentUrl.isEmpty()) {
                fileStorage.deleteByUrl(currentUrl);
                mediaService.deleteMediaByUrl(currentUrl);
                comment.removeImage();
            }
        } else if (!dto.getUrl().equals(currentUrl)) {
            if (currentUrl != null && !currentUrl.isEmpty()) {
                fileStorage.deleteByUrl(currentUrl);
                mediaService.deleteMediaByUrl(currentUrl);
            }
            Media media = processAndLink(dto.getUrl(), comment.getId(), MediaOwner.COMMENT,
                    m -> m.setComment(comment));
            comment.changeImage(media.getUrl());
        }
    }

    // ── User Profile ──────────────────────────────────────────────────────

    @Transactional
    public void updateProfileImage(Long userId, String newImage) {
        User user = userService.findById(userId);
        if (fileStorage.isStorageUrl(user.getProfileUrl())) {
            deleteOldS3Image(user.getProfileUrl());
        }
        if (newImage == null || newImage.isEmpty()) {
            user.updateProfileUrl(null);
            return;
        }
        Media media = processAndLink(newImage, user.getId(), MediaOwner.PROFILE,
                m -> m.setProfileOwner(user));
        user.updateProfileUrl(media.getUrl());
        fileStorage.deletePromotedTmpFiles(List.of(newImage));
    }

    public void deleteOldS3Image(String currentUrl) {
        try {
            fileStorage.deleteByUrl(currentUrl);
            mediaService.deleteMediaByUrl(currentUrl);
        } catch (ResourceNotFoundException e) {}
    }

    // ── Private Helpers ───────────────────────────────────────────────────

    private Media processAndLink(String tmpUrl, Long entityId, MediaOwner owner,
                                 Consumer<Media> entitySetter) {
        String finalUrl = fileStorage.copyToFinalLocation(tmpUrl, entityId, owner);
        return createFromFinalUrl(finalUrl, entitySetter);
    }

    private Media createFromFinalUrl(String finalUrl, Consumer<Media> entitySetter) {
        FileInfo fileInfo = fileStorage.getFileInfo(finalUrl);
        Media media = mediaService.createMedia(fileInfo);
        entitySetter.accept(media);
        return media;
    }
}
