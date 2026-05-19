package com.example.highteenday_backend.services.global;

import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.enums.MediaOwner;
import org.springframework.web.multipart.MultipartFile;

public interface FileStoragePort {

    UploadedResult tmpUpload(Long userId, MultipartFile file);

    void deleteUserTmp(Long userId);

    void deleteByUrl(String url);

    FileInfo getFileInfo(String url);

    String copyToFinalLocation(String tmpUrl, Long entityId, MediaOwner mediaOwner);

    boolean isStorageUrl(String url);
}
