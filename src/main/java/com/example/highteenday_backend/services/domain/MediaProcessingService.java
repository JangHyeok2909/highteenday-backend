package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.Utils.MediaUtils;
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
        post.updateContent(replaceUrlContent);
        fileStorage.deleteUserTmp(userId);
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
            post.updateContent(newContent);
            return;
        }

        if (!addedUrls.isEmpty()) {
            String replaceUrlContent = newContent;
            for (String u : addedUrls) {
                String postFileUrl = fileStorage.copyToFinalLocation(u, post.getId(), MediaOwner.POST);
                createFromFinalUrl(postFileUrl, m -> m.setPost(post));
                replaceUrlContent = replaceUrlContent.replace(u, postFileUrl);
            }
            post.updateContent(replaceUrlContent);
            fileStorage.deleteUserTmp(userId);
            for (String ru : removedUrls) {
                fileStorage.deleteByUrl(ru);
            }
        } else {
            post.updateContent(newContent);
        }
    }

    // ── Comment ───────────────────────────────────────────────────────────

    @Transactional
    public void processCreateCommentMedia(Long userId, Comment comment, RequestCommentDto dto) {
        if (dto.getUrl() == null || dto.getUrl().isEmpty()) return;
        Media media = processAndLink(dto.getUrl(), comment.getId(), MediaOwner.COMMENT,
                m -> m.setComment(comment));
        comment.updateImage(media.getUrl());
        fileStorage.deleteUserTmp(userId);
    }

    @Transactional
    public void processUpdateCommentMedia(Comment comment, RequestCommentDto dto) {
        if (dto.getUrl() == null || dto.getUrl().isEmpty()) {
            String deleteUrl = comment.getS3Url();
            if (!deleteUrl.isEmpty()) {
                fileStorage.deleteByUrl(deleteUrl);
                mediaService.deleteMediaByUrl(deleteUrl);
                comment.updateImage(null);
            }
        } else if (!dto.getUrl().equals(comment.getS3Url())) {
            if (!comment.getS3Url().isEmpty()) {
                fileStorage.deleteByUrl(comment.getS3Url());
                mediaService.deleteMediaByUrl(comment.getS3Url());
            }
            Media media = processAndLink(dto.getUrl(), comment.getId(), MediaOwner.COMMENT,
                    m -> m.setComment(comment));
            comment.updateImage(media.getUrl());
        }
    }

    // ── User Profile ──────────────────────────────────────────────────────

    @Transactional
    public void updateProfileImage(User user, String newImage) {
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
        fileStorage.deleteUserTmp(user.getId());
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
