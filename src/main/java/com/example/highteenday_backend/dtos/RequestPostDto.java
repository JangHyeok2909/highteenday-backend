package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;



@Builder
@AllArgsConstructor
@Data
public class RequestPostDto {
    private Long boardId;
    private String title;
    private String content;
    private boolean isAnonymous;
}
