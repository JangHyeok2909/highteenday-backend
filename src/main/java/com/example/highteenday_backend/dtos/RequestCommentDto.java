package com.example.highteenday_backend.dtos;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

@Data
@AllArgsConstructor
@Builder
public class RequestCommentDto {
    private Long parentId;
    private String content;
    private boolean isAnonymous;
    private String url;
}
