package com.example.highteenday_backend.controllers.testing;


import com.example.highteenday_backend.dtos.PostConsistencyResponse;
import com.example.highteenday_backend.services.testing.PostConsistencyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/posts")
public class PostConsistencyController {
    private final PostConsistencyService consistencyService;

    /**
     * 게시글 정합성 검증 API
     *
     * - 비정규화된 likeCount / dislikeCount
     * - 실제 reactions COUNT
     * 를 비교해서 drift 여부 반환
     *
     *  k6 teardown에서 호출됨
     */
    @GetMapping("/{postId}/consistency")
    public ResponseEntity<PostConsistencyResponse> checkConsistency(
            @PathVariable Long postId
    ) {
        PostConsistencyResponse response = consistencyService.check(postId);
        return ResponseEntity.ok(response);
    }
}
