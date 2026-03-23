package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.boards.Board;
import lombok.Builder;

@Builder
public record BoardDto(
        Long boardId, String boardName
) {
    public static BoardDto fromEntity(Board board) {
        return BoardDto.builder()
                .boardId(board.getId())
                .boardName(board.getName())
                .build();
    }
}
