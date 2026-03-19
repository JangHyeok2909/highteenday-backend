package com.example.highteenday_backend.dtos.paged;

import com.example.highteenday_backend.enums.SortType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import org.springframework.web.bind.annotation.RequestParam;




@AllArgsConstructor
@Builder
@Data
public class PostListingDto {
    Long boardId;
    Integer page;
    SortType sortType;
    Integer size;
}
