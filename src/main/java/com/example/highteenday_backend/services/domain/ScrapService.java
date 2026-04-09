package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.scraps.ScrapRepository;
import com.example.highteenday_backend.domain.users.User;
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
    private final HotPostService hotPostService;

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

    @Transactional
    public Scrap createScrap(Post post, User user) {
        Optional<Scrap> optional = scrapRepository.findByPostAndUser(post, user);
        if (optional.isPresent()) {
            Scrap scrap = optional.get();
            scrap.activeScrap();
            return scrap;
        }
        Scrap scrap = Scrap.builder()
                .post(post)
                .user(user)
                .build();
        //hotscore 갱신
        hotPostService.updateLeaderboardDayScore(post.getId());
        return scrapRepository.save(scrap);
    }

    @Transactional
    public void cancelScrap(Post post, User user) {
        scrapRepository.findByPostAndUser(post, user)
                .ifPresent(Scrap::cancelScrap);
    }
}
