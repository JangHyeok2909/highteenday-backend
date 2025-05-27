package com.example.highteenday_backend.dtos;


import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class RequestCommentDto {
    private Long userId;
    private Long parentId;
    private String content;
    private boolean isAnonymous;

}
