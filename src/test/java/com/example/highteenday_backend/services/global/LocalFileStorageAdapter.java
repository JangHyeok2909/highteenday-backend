package com.example.highteenday_backend.services.global;

import com.example.highteenday_backend.dtos.FileInfo;
import com.example.highteenday_backend.dtos.UploadedResult;
import com.example.highteenday_backend.enums.MediaOwner;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class LocalFileStorageAdapter implements FileStoragePort {

    private static final String BASE_URL = "http://localhost/storage";
    private final Map<String, byte[]> files = new ConcurrentHashMap<>();
    private final Map<String, FileInfo> metadata = new ConcurrentHashMap<>();

    @Override
    public UploadedResult tmpUpload(Long userId, MultipartFile file) {
        try {
            String key = "tmp/" + userId + "/" + UUID.randomUUID() + "-" + file.getOriginalFilename();
            files.put(key, file.getBytes());
            metadata.put(key, FileInfo.builder()
                    .key(key)
                    .url(BASE_URL + "/" + key)
                    .size(file.getSize())
                    .originalFilename(file.getOriginalFilename())
                    .contentType(file.getContentType())
                    .build());

            String url = BASE_URL + "/" + key;
            return new UploadedResult(url, key);
        } catch (Exception e) {
            throw new RuntimeException("파일 업로드 실패", e);
        }
    }

    @Override
    public void deleteUserTmp(Long userId) {
        String prefix = "tmp/" + userId + "/";
        files.keySet().removeIf(k -> k.startsWith(prefix));
        metadata.keySet().removeIf(k -> k.startsWith(prefix));
    }

    @Override
    public void deleteByUrl(String url) {
        String key = extractKey(url);
        files.remove(key);
        metadata.remove(key);
    }

    @Override
    public FileInfo getFileInfo(String url) {
        String key = extractKey(url);
        FileInfo info = metadata.get(key);
        if (info != null) return info;

        return FileInfo.builder()
                .key(key)
                .url(url)
                .size((long) files.getOrDefault(key, new byte[0]).length)
                .originalFilename(key.substring(key.lastIndexOf("/") + 1))
                .contentType("application/octet-stream")
                .build();
    }

    @Override
    public String copyToFinalLocation(String tmpUrl, Long entityId, MediaOwner mediaOwner) {
        String tmpKey = extractKey(tmpUrl);
        String realKey = mediaOwner.getField() + "-file/" + entityId + tmpKey.substring(3);

        byte[] data = files.get(tmpKey);
        if (data != null) {
            files.put(realKey, data);
        }

        FileInfo tmpInfo = metadata.get(tmpKey);
        String finalUrl = BASE_URL + "/" + realKey;
        if (tmpInfo != null) {
            metadata.put(realKey, FileInfo.builder()
                    .key(realKey)
                    .url(finalUrl)
                    .size(tmpInfo.getSize())
                    .originalFilename(tmpInfo.getOriginalFilename())
                    .contentType(tmpInfo.getContentType())
                    .build());
        }

        return finalUrl;
    }

    @Override
    public boolean isStorageUrl(String url) {
        return url != null && url.startsWith(BASE_URL);
    }

    private String extractKey(String url) {
        return url.replace(BASE_URL + "/", "");
    }
}
