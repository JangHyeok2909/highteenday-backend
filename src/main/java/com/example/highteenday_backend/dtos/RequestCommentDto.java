package com.example.highteenday_backend.dtos;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class RequestCommentDto {
    private Long parentId;
    private String content;
    private boolean isAnonymous;
    private String url;
}
