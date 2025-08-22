package com.example.highteenday_backend.dtos;


import lombok.Builder;

@Builder
public record BoardDto(
        Long boardId,String boardName
) {
}
