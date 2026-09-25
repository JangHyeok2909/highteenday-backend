package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.reactions.ReactionCounts;
import com.example.highteenday_backend.domain.reactions.ReactionKind;
import com.example.highteenday_backend.domain.reactions.ReactionStore;
import com.example.highteenday_backend.domain.reactions.ReactionTarget;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.eventEntities.events.ReactionChangedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ReactionService {

    private final Map<ReactionTarget, ReactionStore> stores;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Spring 이 ReactionStore 를 구현한 빈을 모두 넘겨준다. 각 구현이 target() 으로 밝힌 대상을 키로
     * 맵을 만든다.
     */
    public ReactionService(List<ReactionStore> stores, ApplicationEventPublisher eventPublisher) {
        // 대상 하나에 구현이 둘이면 toUnmodifiableMap 이 기동 시점에 IllegalStateException 을 던진다.
        this.stores = stores.stream()
                .collect(Collectors.toUnmodifiableMap(ReactionStore::target, Function.identity()));
        if (this.stores.size() != ReactionTarget.values().length) {
            throw new IllegalStateException("ReactionStore 가 없는 대상이 있다: " + this.stores.keySet());
        }
        this.eventPublisher = eventPublisher;
    }

    /**
     * 내 반응을 kind 로 맞춘다. 같은 요청을 여러 번 보내도 한 번 보낸 것과 결과가 같으므로,
     * 응답이 유실된 뒤의 재시도가 이미 켠 반응을 끄지 않는다.
     */
    @Transactional
    public LikeStateDto set(ReactionTarget target, Long targetId, Long userId, ReactionKind kind) {
        ReactionStore store = stores.get(target);
        store.requireExists(targetId);
        store.upsert(targetId, userId, kind);
        return afterWrite(store, targetId, kind);
    }

    /** 내 반응을 없앤다. 반응이 없어도 성공하고, 여러 번 보내도 결과가 같다. */
    @Transactional
    public LikeStateDto clear(ReactionTarget target, Long targetId, Long userId) {
        ReactionStore store = stores.get(target);
        store.requireExists(targetId);
        store.cancel(targetId, userId);
        return afterWrite(store, targetId, null);
    }

    @Transactional(readOnly = true)
    public Optional<ReactionKind> findMine(ReactionTarget target, Long targetId, Long userId) {
        return Optional.ofNullable(stores.get(target).findMine(List.of(targetId), userId).get(targetId));
    }

    /** 여러 대상에 대한 내 반응을 한 번의 조회로 가져온다. 반응이 없는 대상은 결과 맵에 없다. */
    @Transactional(readOnly = true)
    public Map<Long, ReactionKind> findMine(ReactionTarget target, Collection<Long> targetIds, Long userId) {
        if (targetIds.isEmpty()) return Map.of();
        return stores.get(target).findMine(targetIds, userId);
    }

    /**
     * 쓰기 뒤의 공통 처리. 카운터를 다시 세고, 인기 점수 갱신 이벤트를 내고, 응답을 만든다.
     * set·clear 가 쓰기를 마친 뒤 부른다. mine 은 쓰기 뒤의 내 반응이고, 없으면 null 이다.
     */
    private LikeStateDto afterWrite(ReactionStore store, Long targetId, ReactionKind mine) {
        ReactionCounts counts = store.recount(targetId);
        eventPublisher.publishEvent(new ReactionChangedEvent(store.target(), targetId));
        return LikeStateDto.of(store.target(), targetId, mine, counts);
    }
}
