package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Builder
@AllArgsConstructor
@Data
public class PostRequestDto {
    //tmp
    private Long userId;
    private Long boardId;
    private String title;
    private String content;
    private boolean isAnonymous;
}
