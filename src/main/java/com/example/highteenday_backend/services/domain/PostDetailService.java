package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.reactions.ReactionKind;
import com.example.highteenday_backend.domain.reactions.ReactionTarget;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.PostDto;
import com.example.highteenday_backend.services.domain.redisService.ViewCountService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PostDetailService {
    private final ReactionService reactionService;
    private final ScrapService scrapService;
    private final ViewCountService viewCountService;

    public void applyUserContext(PostDto dto, Post post, User user) {
        ReactionKind mine = reactionService.findMine(ReactionTarget.POST, post.getId(), user.getId()).orElse(null);
        dto.setLiked(mine == ReactionKind.LIKE);
        dto.setDisliked(mine == ReactionKind.DISLIKE);
        dto.setOwner(post.getUser().getId().equals(user.getId()));
        dto.setScrapped(scrapService.isScraped(post, user));
        viewCountService.increaseViewCount(post.getId(), user.getId());
    }
}
