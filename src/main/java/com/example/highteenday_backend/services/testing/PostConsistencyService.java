package com.example.highteenday_backend.services.testing;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.posts.PostReactionRepository;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.dtos.PostConsistencyResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PostConsistencyService {

    private final PostRepository postRepository;
    private final PostReactionRepository reactionRepository;

    /**
     * 🔥 핵심 검증 로직
     */
    public PostConsistencyResponse check(Long postId) {

        // 1️⃣ posts 테이블 (비정규화 값)
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new IllegalArgumentException("post not found"));

        int likeCount = post.getLikeCount();
        int dislikeCount = post.getDislikeCount();

        // 2️⃣ 실제 COUNT (정규화된 진실)
        int likeActual = reactionRepository.countByPostAndKindAndIsValidTrue(
                post, PostReactionKind.LIKE
        );

        int dislikeActual = reactionRepository.countByPostAndKindAndIsValidTrue(
                post, PostReactionKind.DISLIKE
        );

        // 3️⃣ drift 판단
        boolean drift = (likeCount != likeActual) || (dislikeCount != dislikeActual);

        return new PostConsistencyResponse(
                postId,
                likeCount,
                dislikeCount,
                likeActual,
                dislikeActual,
                drift
        );
    }
}
