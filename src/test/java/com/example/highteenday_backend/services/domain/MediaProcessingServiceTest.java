package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.enums.MediaOwner;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.global.FileStoragePort;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MediaProcessingServiceTest {

    private static final Long USER_ID = 1L;
    private static final Long POST_ID = 10L;
    private static final Long COMMENT_ID = 20L;

    private static final String TMP_URL = "https://s3.amazonaws.com/bucket/tmp/1/uuid-image.png";
    private static final String FINAL_URL = "https://s3.amazonaws.com/bucket/post-file/10/uuid-image.png";
    private static final String FINAL_URL_2 = "https://s3.amazonaws.com/bucket/post-file/10/uuid-image2.png";
    private static final String COMMENT_FINAL_URL = "https://s3.amazonaws.com/bucket/comment-file/20/uuid-image.png";
    private static final String PROFILE_FINAL_URL = "https://s3.amazonaws.com/bucket/profile-file/1/uuid-image.png";

    @Mock
    private FileStoragePort fileStorage;
    @Mock
    private MediaService mediaService;

    @InjectMocks
    private MediaProcessingService mediaProcessingService;

    private FileInfo defaultFileInfo;
    private Media defaultMedia;

    @BeforeEach
    void setUp() {
        defaultFileInfo = FileInfo.builder()
                .key("post-file/10/uuid-image.png")
                .url(FINAL_URL)
                .size(1024L)
                .originalFilename("uuid-image.png")
                .contentType("image/png")
                .build();

        defaultMedia = Media.builder()
                .id(100L)
                .originName("uuid-image.png")
                .s3Key("post-file/10/uuid-image.png")
                .url(FINAL_URL)
                .size(1024L)
                .contentType("image/png")
                .build();
    }

    // ── Post Media ──────────────────────────────────────────────────────

    @Nested
    @DisplayName("processCreatePostMedia")
    class ProcessCreatePostMedia {

        @Test
        @DisplayName("이미지가 포함된 게시글 생성 시 tmp에서 최종 위치로 복사하고 URL을 교체한다")
        void copiesTmpToFinalAndReplacesUrl() {
            Post post = Post.builder()
                    .id(POST_ID)
                    .content("<p>Hello</p><img src=\"" + TMP_URL + "\">")
                    .build();

            when(fileStorage.copyToFinalLocation(TMP_URL, POST_ID, MediaOwner.POST))
                    .thenReturn(FINAL_URL);
            when(fileStorage.getFileInfo(FINAL_URL)).thenReturn(defaultFileInfo);
            when(mediaService.createMedia(defaultFileInfo)).thenReturn(defaultMedia);

            mediaProcessingService.processCreatePostMedia(USER_ID, post);

            assertThat(post.getContent()).contains(FINAL_URL);
            assertThat(post.getContent()).doesNotContain(TMP_URL);
            verify(fileStorage).copyToFinalLocation(TMP_URL, POST_ID, MediaOwner.POST);
            verify(fileStorage).deleteUserTmp(USER_ID);
            verify(mediaService).createMedia(defaultFileInfo);
        }

        @Test
        @DisplayName("이미지가 없는 게시글 생성 시 아무 작업도 하지 않는다")
        void noImageDoesNothing() {
            Post post = Post.builder()
                    .id(POST_ID)
                    .content("<p>텍스트만 있는 게시글</p>")
                    .build();

            mediaProcessingService.processCreatePostMedia(USER_ID, post);

            verifyNoInteractions(fileStorage);
            verifyNoInteractions(mediaService);
        }
    }

    @Nested
    @DisplayName("processUpdatePostMedia")
    class ProcessUpdatePostMedia {

        @Test
        @DisplayName("새 이미지가 추가되면 복사하고 기존 제거된 이미지는 삭제한다")
        void addsNewAndRemovesOld() {
            String oldUrl = FINAL_URL;
            String newTmpUrl = "https://s3.amazonaws.com/bucket/tmp/1/uuid-image2.png";

            Post post = Post.builder().id(POST_ID).content("old").build();
            String oldContent = "<p>Old</p><img src=\"" + oldUrl + "\">";
            String newContent = "<p>New</p><img src=\"" + newTmpUrl + "\">";

            when(fileStorage.copyToFinalLocation(newTmpUrl, POST_ID, MediaOwner.POST))
                    .thenReturn(FINAL_URL_2);
            when(fileStorage.getFileInfo(FINAL_URL_2)).thenReturn(defaultFileInfo);
            when(mediaService.createMedia(defaultFileInfo)).thenReturn(defaultMedia);

            mediaProcessingService.processUpdatePostMedia(USER_ID, post, newContent, oldContent);

            verify(fileStorage).copyToFinalLocation(newTmpUrl, POST_ID, MediaOwner.POST);
            verify(fileStorage).deleteUserTmp(USER_ID);
            verify(fileStorage).deleteByUrl(oldUrl);
        }

        @Test
        @DisplayName("이미지가 없는 내용으로 수정하면 content만 업데이트한다")
        void noImageUpdatesContentOnly() {
            Post post = Post.builder().id(POST_ID).content("old").build();
            String newContent = "<p>텍스트만</p>";
            String oldContent = "<p>이전 텍스트</p>";

            mediaProcessingService.processUpdatePostMedia(USER_ID, post, newContent, oldContent);

            assertThat(post.getContent()).isEqualTo(newContent);
            verify(fileStorage, never()).copyToFinalLocation(any(), any(), any());
        }

        @Test
        @DisplayName("이미지 변경이 없으면 복사/삭제 없이 content만 업데이트한다")
        void sameImageUpdatesContentOnly() {
            String imageUrl = FINAL_URL;
            Post post = Post.builder().id(POST_ID).content("old").build();
            String content = "<p>Text</p><img src=\"" + imageUrl + "\">";

            mediaProcessingService.processUpdatePostMedia(USER_ID, post, content, content);

            assertThat(post.getContent()).isEqualTo(content);
            verify(fileStorage, never()).copyToFinalLocation(any(), any(), any());
            verify(fileStorage, never()).deleteByUrl(any());
        }
    }

    // ── Comment Media ───────────────────────────────────────────────────

    @Nested
    @DisplayName("processCreateCommentMedia")
    class ProcessCreateCommentMedia {

        @Test
        @DisplayName("URL이 있으면 이미지를 최종 위치로 복사하고 댓글에 설정한다")
        void copiesAndSetsImage() {
            Comment comment = Comment.builder()
                    .id(COMMENT_ID)
                    .content("댓글")
                    .s3Url("")
                    .build();
            RequestCommentDto dto = RequestCommentDto.builder()
                    .content("댓글")
                    .url(TMP_URL)
                    .build();

            Media commentMedia = Media.builder()
                    .id(200L).url(COMMENT_FINAL_URL).build();

            when(fileStorage.copyToFinalLocation(TMP_URL, COMMENT_ID, MediaOwner.COMMENT))
                    .thenReturn(COMMENT_FINAL_URL);
            FileInfo commentFileInfo = FileInfo.builder()
                    .key("comment-file/20/uuid-image.png")
                    .url(COMMENT_FINAL_URL)
                    .size(512L)
                    .originalFilename("uuid-image.png")
                    .contentType("image/png")
                    .build();
            when(fileStorage.getFileInfo(COMMENT_FINAL_URL)).thenReturn(commentFileInfo);
            when(mediaService.createMedia(commentFileInfo)).thenReturn(commentMedia);

            mediaProcessingService.processCreateCommentMedia(USER_ID, comment, dto);

            assertThat(comment.getS3Url()).isEqualTo(COMMENT_FINAL_URL);
            verify(fileStorage).deleteUserTmp(USER_ID);
        }

        @Test
        @DisplayName("URL이 null이면 아무 작업도 하지 않는다")
        void nullUrlDoesNothing() {
            Comment comment = Comment.builder()
                    .id(COMMENT_ID).content("댓글").s3Url("").build();
            RequestCommentDto dto = RequestCommentDto.builder()
                    .content("댓글").url(null).build();

            mediaProcessingService.processCreateCommentMedia(USER_ID, comment, dto);

            verifyNoInteractions(fileStorage);
        }

        @Test
        @DisplayName("URL이 빈 문자열이면 아무 작업도 하지 않는다")
        void emptyUrlDoesNothing() {
            Comment comment = Comment.builder()
                    .id(COMMENT_ID).content("댓글").s3Url("").build();
            RequestCommentDto dto = RequestCommentDto.builder()
                    .content("댓글").url("").build();

            mediaProcessingService.processCreateCommentMedia(USER_ID, comment, dto);

            verifyNoInteractions(fileStorage);
        }
    }

    @Nested
    @DisplayName("processUpdateCommentMedia")
    class ProcessUpdateCommentMedia {

        @Test
        @DisplayName("URL이 null이고 기존 이미지가 있으면 삭제한다")
        void removesExistingImage() {
            Comment comment = Comment.builder()
                    .id(COMMENT_ID).content("댓글").s3Url(COMMENT_FINAL_URL).build();
            RequestCommentDto dto = RequestCommentDto.builder()
                    .content("댓글").url(null).build();

            mediaProcessingService.processUpdateCommentMedia(comment, dto);

            verify(fileStorage).deleteByUrl(COMMENT_FINAL_URL);
            verify(mediaService).deleteMediaByUrl(COMMENT_FINAL_URL);
            assertThat(comment.getS3Url()).isNull();
        }

        @Test
        @DisplayName("새 URL로 변경하면 기존 이미지를 삭제하고 새 이미지를 설정한다")
        void replacesImage() {
            String oldUrl = COMMENT_FINAL_URL;
            String newTmpUrl = TMP_URL;
            String newFinalUrl = "https://s3.amazonaws.com/bucket/comment-file/20/uuid-new.png";

            Comment comment = Comment.builder()
                    .id(COMMENT_ID).content("댓글").s3Url(oldUrl).build();
            RequestCommentDto dto = RequestCommentDto.builder()
                    .content("댓글").url(newTmpUrl).build();

            Media newMedia = Media.builder().id(201L).url(newFinalUrl).build();
            FileInfo newFileInfo = FileInfo.builder()
                    .key("comment-file/20/uuid-new.png").url(newFinalUrl)
                    .size(256L).originalFilename("uuid-new.png").contentType("image/jpeg")
                    .build();

            when(fileStorage.copyToFinalLocation(newTmpUrl, COMMENT_ID, MediaOwner.COMMENT))
                    .thenReturn(newFinalUrl);
            when(fileStorage.getFileInfo(newFinalUrl)).thenReturn(newFileInfo);
            when(mediaService.createMedia(newFileInfo)).thenReturn(newMedia);

            mediaProcessingService.processUpdateCommentMedia(comment, dto);

            verify(fileStorage).deleteByUrl(oldUrl);
            verify(mediaService).deleteMediaByUrl(oldUrl);
            assertThat(comment.getS3Url()).isEqualTo(newFinalUrl);
        }

        @Test
        @DisplayName("URL이 동일하면 아무 작업도 하지 않는다")
        void sameUrlDoesNothing() {
            Comment comment = Comment.builder()
                    .id(COMMENT_ID).content("댓글").s3Url(COMMENT_FINAL_URL).build();
            RequestCommentDto dto = RequestCommentDto.builder()
                    .content("댓글").url(COMMENT_FINAL_URL).build();

            mediaProcessingService.processUpdateCommentMedia(comment, dto);

            verify(fileStorage, never()).deleteByUrl(any());
            verify(fileStorage, never()).copyToFinalLocation(any(), any(), any());
        }
    }

    // ── User Profile ────────────────────────────────────────────────────

    @Nested
    @DisplayName("updateProfileImage")
    class UpdateProfileImage {

        @Test
        @DisplayName("기존 스토리지 이미지가 있으면 삭제 후 새 이미지를 설정한다")
        void replacesOldStorageImage() {
            String oldProfileUrl = PROFILE_FINAL_URL;
            String newTmpUrl = TMP_URL;
            String newFinalUrl = "https://s3.amazonaws.com/bucket/profile-file/1/uuid-new.png";

            User user = User.builder().id(USER_ID).profileUrl(oldProfileUrl).build();

            Media newMedia = Media.builder().id(300L).url(newFinalUrl).build();
            FileInfo newFileInfo = FileInfo.builder()
                    .key("profile-file/1/uuid-new.png").url(newFinalUrl)
                    .size(2048L).originalFilename("uuid-new.png").contentType("image/png")
                    .build();

            when(fileStorage.isStorageUrl(oldProfileUrl)).thenReturn(true);
            when(fileStorage.copyToFinalLocation(newTmpUrl, USER_ID, MediaOwner.PROFILE))
                    .thenReturn(newFinalUrl);
            when(fileStorage.getFileInfo(newFinalUrl)).thenReturn(newFileInfo);
            when(mediaService.createMedia(newFileInfo)).thenReturn(newMedia);

            mediaProcessingService.updateProfileImage(user, newTmpUrl);

            verify(fileStorage).deleteByUrl(oldProfileUrl);
            assertThat(user.getProfileUrl()).isEqualTo(newFinalUrl);
            verify(fileStorage).deleteUserTmp(USER_ID);
        }

        @Test
        @DisplayName("OAuth 프로필 이미지(외부 URL)는 삭제하지 않고 새 이미지를 설정한다")
        void doesNotDeleteExternalUrl() {
            String oauthUrl = "https://lh3.googleusercontent.com/photo.jpg";
            String newTmpUrl = TMP_URL;
            String newFinalUrl = PROFILE_FINAL_URL;

            User user = User.builder().id(USER_ID).profileUrl(oauthUrl).build();

            Media newMedia = Media.builder().id(301L).url(newFinalUrl).build();
            FileInfo newFileInfo = FileInfo.builder()
                    .key("profile-file/1/uuid-image.png").url(newFinalUrl)
                    .size(1024L).originalFilename("uuid-image.png").contentType("image/png")
                    .build();

            when(fileStorage.isStorageUrl(oauthUrl)).thenReturn(false);
            when(fileStorage.copyToFinalLocation(newTmpUrl, USER_ID, MediaOwner.PROFILE))
                    .thenReturn(newFinalUrl);
            when(fileStorage.getFileInfo(newFinalUrl)).thenReturn(newFileInfo);
            when(mediaService.createMedia(newFileInfo)).thenReturn(newMedia);

            mediaProcessingService.updateProfileImage(user, newTmpUrl);

            verify(fileStorage, never()).deleteByUrl(oauthUrl);
            assertThat(user.getProfileUrl()).isEqualTo(newFinalUrl);
        }

        @Test
        @DisplayName("null 이미지로 변경하면 프로필을 제거한다")
        void removesProfileImage() {
            User user = User.builder().id(USER_ID).profileUrl(PROFILE_FINAL_URL).build();

            when(fileStorage.isStorageUrl(PROFILE_FINAL_URL)).thenReturn(true);

            mediaProcessingService.updateProfileImage(user, null);

            verify(fileStorage).deleteByUrl(PROFILE_FINAL_URL);
            assertThat(user.getProfileUrl()).isNull();
            verify(fileStorage, never()).copyToFinalLocation(any(), any(), any());
        }
    }

    // ── deleteOldS3Image ────────────────────────────────────────────────

    @Nested
    @DisplayName("deleteOldS3Image")
    class DeleteOldS3Image {

        @Test
        @DisplayName("스토리지 파일과 DB Media 레코드를 삭제한다")
        void deletesBothStorageAndDb() {
            mediaProcessingService.deleteOldS3Image(FINAL_URL);

            verify(fileStorage).deleteByUrl(FINAL_URL);
            verify(mediaService).deleteMediaByUrl(FINAL_URL);
        }

        @Test
        @DisplayName("Media 레코드가 없어도 예외를 던지지 않는다")
        void swallowsResourceNotFoundException() {
            doThrow(new ResourceNotFoundException("not found"))
                    .when(mediaService).deleteMediaByUrl(FINAL_URL);

            mediaProcessingService.deleteOldS3Image(FINAL_URL);

            verify(fileStorage).deleteByUrl(FINAL_URL);
        }
    }
}
