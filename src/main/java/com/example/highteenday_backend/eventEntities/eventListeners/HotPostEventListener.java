package com.example.highteenday_backend.eventEntities.eventListeners;

import com.example.highteenday_backend.domain.reactions.ReactionTarget;
import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.eventEntities.events.ReactionChangedEvent;
import com.example.highteenday_backend.eventEntities.events.ScrapToggledEvent;
import com.example.highteenday_backend.services.domain.HotPostService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class HotPostEventListener {
    private final HotPostService hotPostService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCommentCreated(CommentCreatedEvent event) {
        hotPostService.updateLeaderboardDayScore(event.getPostId());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onReactionChanged(ReactionChangedEvent event) {
        if (event.getTarget() != ReactionTarget.POST) return;
        hotPostService.updateLeaderboardDayScore(event.getTargetId());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onScrapToggled(ScrapToggledEvent event) {
        hotPostService.updateLeaderboardDayScore(event.getPostId());
    }
}
