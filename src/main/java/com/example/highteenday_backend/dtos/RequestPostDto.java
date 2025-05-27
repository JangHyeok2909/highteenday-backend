package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;



@Builder
@AllArgsConstructor
@Data
public class RequestPostDto {
    //tmp
    private Long userId;
    private Long boardId;
    private String title;
    private String content;
    private boolean isAnonymous;
}
