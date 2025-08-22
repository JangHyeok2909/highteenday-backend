package com.example.highteenday_backend.controllers;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.dtos.BoardDto;
import com.example.highteenday_backend.services.domain.BoardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;


@Tag(name = "게시판 API")
@RequiredArgsConstructor
@RequestMapping("/api/boards")
@RestController
public class BoardController {
    private final BoardService boardService;
    @Operation(summary = "게시판 리스트 조회")
    @GetMapping()
    public ResponseEntity<?> getBoards(){
        List<Board> all = boardService.findAll();
        List<BoardDto> dtos = new ArrayList<>();
        for(Board b:all){
            dtos.add(b.toDto());
        }
        return ResponseEntity.ok(dtos);
    }
}
