package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.dtos.PostDto;
import com.example.highteenday_backend.services.domain.redisService.ViewCountService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PostDetailService {
    private final PostReactionService postReactionService;
    private final ScrapService scrapService;
    private final ViewCountService viewCountService;

    public void applyUserContext(PostDto dto, Post post, User user) {
        LikeStateDto likeState = postReactionService.getLikeSatateDto(post, user);
        dto.setLiked(likeState.isLiked());
        dto.setDisliked(likeState.isDisliked());
        dto.setOwner(post.getUser().getId().equals(user.getId()));
        dto.setScrapped(scrapService.isScraped(post, user));
        viewCountService.increaseViewCount(post.getId(), user.getId());
    }
}
