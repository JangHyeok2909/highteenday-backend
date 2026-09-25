package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.reactions.ReactionCounts;
import com.example.highteenday_backend.domain.reactions.ReactionKind;
import com.example.highteenday_backend.domain.reactions.ReactionTarget;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class LikeStateDto {
    private Long commentId;
    private Long postId;
    private boolean isLiked=false;
    private boolean isDisliked=false;
    private int likeCount=0;
    private int dislikeCount=0;

    /** mine 이 null 이면 반응이 없는 상태다. */
    public static LikeStateDto of(ReactionTarget target, Long targetId, ReactionKind mine, ReactionCounts counts) {
        return LikeStateDto.builder()
                .postId(target == ReactionTarget.POST ? targetId : null)
                .commentId(target == ReactionTarget.COMMENT ? targetId : null)
                .isLiked(mine == ReactionKind.LIKE)
                .isDisliked(mine == ReactionKind.DISLIKE)
                .likeCount(counts.likes())
                .dislikeCount(counts.dislikes())
                .build();
    }
}
