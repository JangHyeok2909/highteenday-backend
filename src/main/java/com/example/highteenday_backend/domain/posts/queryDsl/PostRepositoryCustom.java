package com.example.highteenday_backend.domain.posts.queryDsl;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.paged.PageResponse;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.PostSearchType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;


public interface PostRepositoryCustom {

    Page<Post> searchKeywordsAll(String keywords, PostSearchType searchType, Pageable pageable);
    Page<Post> searchKeywords(Long boardId,String keywords, PostSearchType searchType, Pageable pageable);

    PageResponse<PostPreviewDto> findByBoardCursor(PostListingDto dto);
    PageResponse<PostPreviewDto> findByBoardOffset(PostListingDto dto);
}
