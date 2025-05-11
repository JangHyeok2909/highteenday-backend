package com.example.highteenday_backend.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.List;


@Builder
@AllArgsConstructor
@Data
public class PagedPostsDto {
    //page, totalPages, totalElements
    private int page;
    private int totalPages;
    private long totalElements;
    private List<PostDto> postDtos;
}
