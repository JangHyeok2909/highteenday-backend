package com.example.highteenday_backend.dtos;

import lombok.Data;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Data
public class PostRequestDto {
    private Long userId; //tmp
    private Long boardId; //tmp
    private String title;
    private String content;
    private boolean isAnonymous;
}
