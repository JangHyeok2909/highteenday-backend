package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.scraps.ScrapRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.redisService.PostPrevCache;
import lombok.RequiredArgsConstructor;
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
    private final HotPostService hotPostService;
    private final PostPrevCache postPrevCache;

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

        if (alreadyScraped) {
            optional.get().cancelScrap();
            message = "스크랩 취소.";
        } else {
            if (optional.isPresent()) {
                optional.get().activeScrap();
            } else {
                scrapRepository.save(Scrap.builder().post(post).user(user).build());
                hotPostService.updateLeaderboardDayScore(postId);
            }
            message = "스크랩 완료.";
        }

        post.updateScrapCount(Math.toIntExact(scrapRepository.countValidByPost(post)));
        postPrevCache.evictPostPrev(postId);
        return message;
    }

}
