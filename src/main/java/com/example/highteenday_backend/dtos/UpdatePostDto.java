package com.example.highteenday_backend.dtos;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;
import lombok.Data;


@Builder
@AllArgsConstructor
@NoArgsConstructor
@Data
public class UpdatePostDto {
    @NotBlank(message = "제목을 입력하세요.")
    String title;
    @NotBlank(message = "내용을 입력하세요.")
    String content;
    boolean isAnonymous;
}
