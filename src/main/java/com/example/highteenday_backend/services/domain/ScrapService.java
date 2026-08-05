package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.scraps.ScrapRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.eventEntities.events.ScrapToggledEvent;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.redisService.PostPrevCache;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@RequiredArgsConstructor
@Service
public class ScrapService {
    private final ScrapRepository scrapRepository;
    private final PostRepository postRepository;
    private final PostPrevCache postPrevCache;
    private final ApplicationEventPublisher eventPublisher;

    public List<Scrap> getRecentScrapsByUser(User user) {
        List<Scrap> scraps = scrapRepository.findByUser(user);
        scraps.sort(Comparator.comparing(Scrap::getCreated).reversed());
        return scraps;
    }

    public boolean isScraped(Post post, User user) {
        return scrapRepository.findByPostAndUser(post, user)
                .map(s -> Boolean.TRUE.equals(s.getIsValid()))
                .orElse(false);
    }

    public long countValidByPost(Post post) {
        return scrapRepository.countValidByPost(post);
    }

    /**
     * 스크랩 토글 (생성 또는 취소) + 카운트 동기화 + 캐시 무효화를 단일 트랜잭션으로 처리.
     * 컨트롤러에서 직접 호출하는 진입점.
     */
    @Transactional
    public String toggleScrap(Long postId, User user) {
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new ResourceNotFoundException("post does not exist, postId=" + postId));

        Optional<Scrap> optional = scrapRepository.findByPostAndUser(post, user);
        boolean alreadyScraped = optional.map(s -> Boolean.TRUE.equals(s.getIsValid())).orElse(false);
        String message;
        boolean newScrap = false;

        if (alreadyScraped) {
            optional.get().cancelScrap();
            message = "스크랩 취소.";
        } else {
            // 켜는 쪽은 upsert 한 문장으로 끝낸다. 동시 요청 둘이 모두 "없음"을 보고 들어와도
            // 하나는 INSERT, 하나는 UPDATE 가 되어 최종 상태가 같다 — 예외 경로가 없다.
            // affected rows 1 = 새로 만든 것, 2 = 기존 행을 되살린 것.
            newScrap = scrapRepository.upsertActive(user.getId(), postId) == 1;
            message = "스크랩 완료.";
        }

        post.syncScrapCount(Math.toIntExact(scrapRepository.countValidByPost(post)));
        postPrevCache.evictPostPrev(postId);
        eventPublisher.publishEvent(new ScrapToggledEvent(postId, newScrap));
        return message;
    }

}
