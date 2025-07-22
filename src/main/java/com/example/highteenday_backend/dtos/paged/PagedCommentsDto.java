package com.example.highteenday_backend.dtos.paged;

import com.example.highteenday_backend.dtos.CommentDto;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Builder
@AllArgsConstructor
@Data
public class PagedCommentsDto {
    private int page;
    private int totalPages;
    private long totalElements;
    private List<CommentDto> commentDtos;
}
