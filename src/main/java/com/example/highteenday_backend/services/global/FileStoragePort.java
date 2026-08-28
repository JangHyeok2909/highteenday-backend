package com.example.highteenday_backend.services.global;

import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.enums.MediaOwner;
import org.springframework.web.multipart.MultipartFile;

import java.util.Collection;

public interface FileStoragePort {

    UploadedResult tmpUpload(Long userId, MultipartFile file);

    /**
     * 방금 최종 위치로 옮긴 임시 파일들만 지운다.
     *
     * <p>예전에는 {@code deleteUserTmp(userId)} 로 그 사용자의 {@code tmp/} 아래를
     * <b>통째로</b> 지웠다. 같은 사용자가 탭 두 개로 글을 동시에 쓰면, 먼저 확정한 글이
     * 아직 확정되지 않은 다른 글의 임시 이미지까지 지워 버렸다
     * (docs/KNOWN-ISSUES.md KI-36). 이제 이번 요청이 실제로 승격시킨 URL 만 넘겨
     * 그 범위만 정리한다.
     */
    void deletePromotedTmpFiles(Collection<String> tmpUrls);

    void deleteByUrl(String url);

    FileInfo getFileInfo(String url);

    String copyToFinalLocation(String tmpUrl, Long entityId, MediaOwner mediaOwner);

    boolean isStorageUrl(String url);
}
