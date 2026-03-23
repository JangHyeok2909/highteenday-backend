package com.example.highteenday_backend.dtos;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Builder
@NoArgsConstructor
@AllArgsConstructor
@Data
public class RequestPostDto {
    @NotNull
    private Long boardId;

    @NotBlank
    @Size(max = 50, message = "제목은 50자 이하로 입력해주세요.")
    private String title;

    @NotBlank
    private String content;

    private boolean isAnonymous;
}
