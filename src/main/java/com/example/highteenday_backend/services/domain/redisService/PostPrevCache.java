package com.example.highteenday_backend.services.domain.redisService;

import com.example.highteenday_backend.dtos.PostPreviewDto;

import java.util.List;

public interface PostPrevCache {

    /**
     * 게시판 목록 캐시가 담는 최대 게시글 수. 조회 범위가 이 값을 넘으면 캐시에는
     * 답이 존재할 수 없으므로 호출자가 DB로 직행해야 한다 (docs/KNOWN-ISSUES.md KI-57).
     */
    int MAX_CACHED_POSTS = 50;

    List<PostPreviewDto> getPostPrevs(Long boardId,int page,int size);
    void cachePostPrev(PostPreviewDto postPrev);
    void addPostToBoard(Long boardId, Long postId);
    void evictBoard(Long boardId);
    void evictPostPrev(Long postId);
    Long getCount(Long boardId);
    Long createCount(Long boardId);
    void incrementBoardCount(Long boardId);
    void decrementBoardCount(Long boardId);

}
