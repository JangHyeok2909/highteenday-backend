package com.example.highteenday_backend.services.global;

import com.amazonaws.services.s3.AmazonS3;
import com.amazonaws.services.s3.model.*;
import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.enums.MediaOwner;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.UUID;

@Service
@Getter
@RequiredArgsConstructor
public class S3Service {
    private final AmazonS3 amazonS3;
    @Value("${cloud.aws.s3.bucket}")
    private String bucket;

    public UploadedResult tmpUpload(Long userId,MultipartFile file) {
        try {
            String key ="tmp/"+userId+"/"+UUID.randomUUID() + "-" + file.getOriginalFilename();

            ObjectMetadata metadata = new ObjectMetadata();
            metadata.setContentLength(file.getSize());
            metadata.setContentType(file.getContentType());

            amazonS3.putObject(bucket, key, file.getInputStream(), metadata);
            String url = amazonS3.getUrl(bucket, key).toString();

            UploadedResult uploadedResult = new UploadedResult(url,key);
            return uploadedResult;
        } catch (IOException e) {
            throw new RuntimeException("파일 업로드 실패", e);
        }
    }
    public void deleteUserTmp(Long userId) {
        String prefix = "tmp/" + userId + "/";

        // 1. 목록 조회
        ListObjectsV2Request listReq = new ListObjectsV2Request()
                .withBucketName(bucket)
                .withPrefix(prefix);

        ListObjectsV2Result listRes = amazonS3.listObjectsV2(listReq);

        // 2. 반복 삭제
        for (S3ObjectSummary objectSummary : listRes.getObjectSummaries()) {
            amazonS3.deleteObject(bucket, objectSummary.getKey());
        }
    }

    public void delete(String key){
        amazonS3.deleteObject(bucket,key);
    }

    public FileInfo getFileInfo(String key){
        ObjectMetadata metadata = amazonS3.getObjectMetadata(bucket,key);
        String url = amazonS3.getUrl(bucket, key).toString();
        long size = metadata.getContentLength();
        String contentType = metadata.getContentType();
        String originalFilename = key.substring(key.lastIndexOf("/") + 1);

        return FileInfo.builder()
                .key(key)
                .url(url)
                .size(size)
                .originalFilename(originalFilename)
                .contentType(contentType)
                .build();
    }
    public String getKeyByUrl(String url){
        try {
            String key = new URI(url).getPath().substring(1);
            return key;
        } catch (Exception e) {
            throw new RuntimeException("잘못된 url 형식, url="+url);
        }
    }
    public String copyToFinalLocation(String url, Long entityId, MediaOwner mediaOwner){
        String tmpKey = getKeyByUrl(url);
//        String realKey = copyToRealPath(tmpKey,id,mediaOwner);
        String copiedKey = mediaOwner.getField()+"-file/"+entityId+tmpKey.substring(3);
        CopyObjectRequest copyRequest = new CopyObjectRequest(bucket, tmpKey, bucket, copiedKey);
        amazonS3.copyObject(copyRequest);
        String realUrl = getUrlToKey(copiedKey);
        return realUrl;
    }
    public String getUrlToKey(String key){
        return amazonS3.getUrl(bucket,key).toString();
    }
}
