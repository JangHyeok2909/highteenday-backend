package com.example.highteenday_backend.dtos.paged;

import com.example.highteenday_backend.dtos.PostDto;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;


@Builder
@AllArgsConstructor
@Data
public class PagedPostsDto {
    //page, totalPages, totalElements
    private String boardName;
    private int page;
    private int totalPages;
    private long totalElements;
    private List<PostDto> postDtos;
}
