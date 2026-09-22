package com.example.highteenday_backend.controllers;


import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.services.domain.HotPostService;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "실시간 인기글 조회 API", description = "5분 간격으로 업데이트 되는 실시간 인기글 조회(좋아요 컷 10개)")
@RequestMapping("/api/hotposts")
@RequiredArgsConstructor
@RestController
public class HotPostController {
    private final HotPostService hotPostService;

    @GetMapping("/daily")
    public ResponseEntity<List<PostPreviewDto>> getLeaderboardDayHotPosts(){
        List<PostPreviewDto> postPreviewDtos = hotPostService.getLeaderboardDayHotPosts();

        return ResponseEntity.ok(postPreviewDtos);
    }
}
