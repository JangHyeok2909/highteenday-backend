package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.boards.BoardRepository;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@RequiredArgsConstructor
@Service
public class BoardService {
    private final BoardRepository boardRepository;

    public Board findById(Long boardId){
        return boardRepository.findById(boardId)
                .orElseThrow(()->new ResourceNotFoundException("post does not exist, boardId="+boardId));
    }
    public List<Board> findAll(){
        return boardRepository.findAll();
    }

}
