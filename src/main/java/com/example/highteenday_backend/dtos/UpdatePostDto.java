package com.example.highteenday_backend.dtos;

import lombok.Builder;
import lombok.Data;

@Builder
@Data
public class UpdatePostDto {
    Long userId;
    String title;
    String content;
    boolean isAnonymous;

}
