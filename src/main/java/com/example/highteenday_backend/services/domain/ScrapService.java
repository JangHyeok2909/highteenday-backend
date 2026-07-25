package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.scraps.ScrapRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.eventEntities.events.ScrapToggledEvent;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.redisService.PostPrevCache;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@RequiredArgsConstructor
@Service
public class ScrapService {
    private final ScrapRepository scrapRepository;
    private final PostRepository postRepository;
    private final PostPrevCache postPrevCache;
    private final ApplicationEventPublisher eventPublisher;

    /** 마이페이지 스크랩 목록. 최근 스크랩 순으로 요청한 페이지만 조회한다. */
    public Page<PostPreviewDto> getScrappedPostPreviews(User user, int page, int size) {
        return scrapRepository.findScrappedPostPreviews(user, PageRequest.of(page, size));
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

        // 스크랩 수도 재집계 후 반영하는 read-modify-write이므로 게시글 행을 먼저 잠근다.
        postRepository.findByIdForUpdate(postId)
                .orElseThrow(() -> new ResourceNotFoundException("post does not exist, postId=" + postId));

        Optional<Scrap> optional = scrapRepository.findByPostAndUser(post, user);
        boolean alreadyScraped = optional.map(s -> Boolean.TRUE.equals(s.getIsValid())).orElse(false);
        String message;
        boolean newScrap = false;

        if (alreadyScraped) {
            optional.get().cancelScrap();
            message = "스크랩 취소.";
        } else {
            if (optional.isPresent()) {
                optional.get().activeScrap();
            } else {
                scrapRepository.save(Scrap.builder().post(post).user(user).build());
                newScrap = true;
            }
            message = "스크랩 완료.";
        }

        post.syncScrapCount(Math.toIntExact(scrapRepository.countValidByPost(post)));
        postPrevCache.evictPostPrev(postId);
        eventPublisher.publishEvent(new ScrapToggledEvent(postId, newScrap));
        return message;
    }

}
