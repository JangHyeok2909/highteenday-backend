package com.example.highteenday_backend.services.global;

import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.enums.MediaOwner;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

import java.io.IOException;
import java.net.URI;
import java.util.UUID;

@Service
@Getter
@RequiredArgsConstructor
public class S3Service {
    private final S3Client s3Client;
    @Value("${cloud.aws.s3.bucket}")
    private String bucket;

    public UploadedResult tmpUpload(Long userId, MultipartFile file) {
        try {
            String key = "tmp/" + userId + "/" + UUID.randomUUID() + "-" + file.getOriginalFilename();

            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(key)
                            .contentType(file.getContentType())
                            .contentLength(file.getSize())
                            .build(),
                    RequestBody.fromInputStream(file.getInputStream(), file.getSize())
            );

            String url = getUrlToKey(key);
            return new UploadedResult(url, key);
        } catch (IOException e) {
            throw new RuntimeException("파일 업로드 실패", e);
        }
    }

    public void deleteUserTmp(Long userId) {
        String prefix = "tmp/" + userId + "/";

        ListObjectsV2Response listRes = s3Client.listObjectsV2(
                ListObjectsV2Request.builder()
                        .bucket(bucket)
                        .prefix(prefix)
                        .build()
        );

        for (S3Object s3Object : listRes.contents()) {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucket)
                    .key(s3Object.key())
                    .build());
        }
    }

    public void delete(String key) {
        s3Client.deleteObject(DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build());
    }

    public FileInfo getFileInfo(String key) {
        HeadObjectResponse metadata = s3Client.headObject(HeadObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .build());

        String url = getUrlToKey(key);
        long size = metadata.contentLength();
        String contentType = metadata.contentType();
        String originalFilename = key.substring(key.lastIndexOf("/") + 1);

        return FileInfo.builder()
                .key(key)
                .url(url)
                .size(size)
                .originalFilename(originalFilename)
                .contentType(contentType)
                .build();
    }

    public String getKeyByUrl(String url) {
        try {
            String key = new URI(url).getPath().substring(1);
            return key;
        } catch (Exception e) {
            throw new RuntimeException("잘못된 url 형식, url=" + url);
        }
    }

    public String copyToFinalLocation(String url, Long entityId, MediaOwner mediaOwner) {
        String tmpKey = getKeyByUrl(url);
        String realKey = mediaOwner.getField() + "-file/" + entityId + tmpKey.substring(3);

        s3Client.copyObject(CopyObjectRequest.builder()
                .sourceBucket(bucket)
                .sourceKey(tmpKey)
                .destinationBucket(bucket)
                .destinationKey(realKey)
                .build());

        return getUrlToKey(realKey);
    }

    public String getUrlToKey(String key) {
        return s3Client.utilities().getUrl(b -> b.bucket(bucket).key(key)).toString();
    }
}
