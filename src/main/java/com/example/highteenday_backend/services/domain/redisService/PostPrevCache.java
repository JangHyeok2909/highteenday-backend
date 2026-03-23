package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.dtos.PostPreviewDto;

import java.util.List;

public interface PostPrevCache {

    List<PostPreviewDto> getPostPrevs(Long boardId,int page,int size);
    void cachePostPrev(PostPreviewDto postPrev);
    void addPostToBoard(Long boardId, Long postId);
    Long getCount(Long boardId);
    Long createCount(Long boardId);
    void incrementBoardCount(Long boardId);
    void decrementBoardCount(Long boardId);

}
