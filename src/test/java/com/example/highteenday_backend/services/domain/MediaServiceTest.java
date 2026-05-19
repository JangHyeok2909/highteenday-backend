package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.medias.Media;
import com.example.highteenday_backend.domain.medias.MediaRepository;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.enums.MediaCategory;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MediaServiceTest {

    @Mock
    private MediaRepository mediaRepository;

    @InjectMocks
    private MediaService mediaService;

    // ── findByUrl ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("findByUrl")
    class FindByUrl {

        @Test
        @DisplayName("URL로 Media를 찾으면 반환한다")
        void returnsMediaWhenFound() {
            String url = "https://s3.amazonaws.com/bucket/post-file/1/image.png";
            Media media = Media.builder().id(1L).url(url).build();
            when(mediaRepository.findByUrl(url)).thenReturn(Optional.of(media));

            Media result = mediaService.findByUrl(url);

            assertThat(result.getUrl()).isEqualTo(url);
        }

        @Test
        @DisplayName("URL로 Media를 찾지 못하면 ResourceNotFoundException을 던진다")
        void throwsWhenNotFound() {
            String url = "https://s3.amazonaws.com/bucket/nonexistent.png";
            when(mediaRepository.findByUrl(url)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> mediaService.findByUrl(url))
                    .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    // ── createMedia ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("createMedia")
    class CreateMedia {

        @Test
        @DisplayName("이미지 FileInfo로 Media를 생성하면 IMG 카테고리로 저장한다")
        void createsImageMedia() {
            FileInfo fileInfo = FileInfo.builder()
                    .key("post-file/1/photo.png")
                    .url("https://s3.amazonaws.com/bucket/post-file/1/photo.png")
                    .size(2048L)
                    .originalFilename("photo.png")
                    .contentType("image/png")
                    .build();

            when(mediaRepository.save(any(Media.class))).thenAnswer(inv -> inv.getArgument(0));

            mediaService.createMedia(fileInfo);

            ArgumentCaptor<Media> captor = ArgumentCaptor.forClass(Media.class);
            verify(mediaRepository).save(captor.capture());
            Media saved = captor.getValue();

            assertThat(saved.getOriginName()).isEqualTo("photo.png");
            assertThat(saved.getS3Key()).isEqualTo("post-file/1/photo.png");
            assertThat(saved.getUrl()).isEqualTo(fileInfo.getUrl());
            assertThat(saved.getSize()).isEqualTo(2048L);
            assertThat(saved.getContentType()).isEqualTo("image/png");
            assertThat(saved.getMediaCategory()).isEqualTo(MediaCategory.IMG);
        }

        @Test
        @DisplayName("GIF FileInfo로 Media를 생성하면 GIF 카테고리로 저장한다")
        void createsGifMedia() {
            FileInfo fileInfo = FileInfo.builder()
                    .key("post-file/1/anim.gif")
                    .url("https://s3.amazonaws.com/bucket/post-file/1/anim.gif")
                    .size(512L)
                    .originalFilename("anim.gif")
                    .contentType("image/gif")
                    .build();

            when(mediaRepository.save(any(Media.class))).thenAnswer(inv -> inv.getArgument(0));

            mediaService.createMedia(fileInfo);

            ArgumentCaptor<Media> captor = ArgumentCaptor.forClass(Media.class);
            verify(mediaRepository).save(captor.capture());
            assertThat(captor.getValue().getMediaCategory()).isEqualTo(MediaCategory.GIF);
        }

        @Test
        @DisplayName("비디오 FileInfo로 Media를 생성하면 VIDEO 카테고리로 저장한다")
        void createsVideoMedia() {
            FileInfo fileInfo = FileInfo.builder()
                    .key("post-file/1/clip.mp4")
                    .url("https://s3.amazonaws.com/bucket/post-file/1/clip.mp4")
                    .size(10240L)
                    .originalFilename("clip.mp4")
                    .contentType("video/mp4")
                    .build();

            when(mediaRepository.save(any(Media.class))).thenAnswer(inv -> inv.getArgument(0));

            mediaService.createMedia(fileInfo);

            ArgumentCaptor<Media> captor = ArgumentCaptor.forClass(Media.class);
            verify(mediaRepository).save(captor.capture());
            assertThat(captor.getValue().getMediaCategory()).isEqualTo(MediaCategory.VIDEO);
        }

        @Test
        @DisplayName("지원하지 않는 contentType이면 IllegalArgumentException을 던진다")
        void throwsForUnsupportedContentType() {
            FileInfo fileInfo = FileInfo.builder()
                    .key("post-file/1/doc.pdf")
                    .url("https://s3.amazonaws.com/bucket/post-file/1/doc.pdf")
                    .size(1024L)
                    .originalFilename("doc.pdf")
                    .contentType("application/pdf")
                    .build();

            assertThatThrownBy(() -> mediaService.createMedia(fileInfo))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // ── deleteMediaByUrl ────────────────────────────────────────────────

    @Nested
    @DisplayName("deleteMediaByUrl")
    class DeleteMediaByUrl {

        @Test
        @DisplayName("URL로 Media를 찾아 삭제한다")
        void deletesMedia() {
            String url = "https://s3.amazonaws.com/bucket/post-file/1/image.png";
            Media media = Media.builder().id(1L).url(url).build();
            when(mediaRepository.findByUrl(url)).thenReturn(Optional.of(media));

            mediaService.deleteMediaByUrl(url);

            verify(mediaRepository).delete(media);
        }

        @Test
        @DisplayName("존재하지 않는 URL이면 ResourceNotFoundException을 던진다")
        void throwsWhenNotFound() {
            String url = "https://s3.amazonaws.com/bucket/nonexistent.png";
            when(mediaRepository.findByUrl(url)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> mediaService.deleteMediaByUrl(url))
                    .isInstanceOf(ResourceNotFoundException.class);
        }
    }
}
