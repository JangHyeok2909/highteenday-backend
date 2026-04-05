package com.example.highteenday_backend.services.testing;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.posts.PostReactionRepository;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.dtos.PostConsistencyResponse;
import com.example.highteenday_backend.services.domain.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PostConsistencyService {

    private final PostService postService;
    private final PostReactionRepository reactionRepository;

    public PostConsistencyResponse check(Long postId) {

        Post post = postService.findById(postId);

        int likeCount = post.getLikeCount();
        int dislikeCount = post.getDislikeCount();

        int likeActual = reactionRepository.countByPostAndKindAndIsValidTrue(
                post, PostReactionKind.LIKE
        );

        int dislikeActual = reactionRepository.countByPostAndKindAndIsValidTrue(
                post, PostReactionKind.DISLIKE
        );

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
