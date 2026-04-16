package com.example.highteenday_backend.dtos.paged;

import com.example.highteenday_backend.enums.SortType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.web.bind.annotation.RequestParam;




@AllArgsConstructor
@NoArgsConstructor
@Builder
@Data
public class PostListingDto {
    Long boardId;
    Integer page;
    SortType sortType;
    Integer size;
    Long lastSeedId;
    boolean isRandomPage;
}
