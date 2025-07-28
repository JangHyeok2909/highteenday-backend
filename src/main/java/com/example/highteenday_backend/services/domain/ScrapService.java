package com.example.highteenday_backend.services.domain;

import com.amazonaws.services.kms.model.NotFoundException;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.scraps.ScrapRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

@RequiredArgsConstructor
@Service
public class ScrapService {
    private final ScrapRepository scrapRepository;

    public List<Scrap> getRecentScrapsByUser(User user){
        List<Scrap> scraps = scrapRepository.findByUser(user);
        if(scraps.isEmpty()) throw new ResourceNotFoundException("user scrap dose not exists. userId="+user.getId());
        scraps.sort(Comparator.comparing(Scrap::getCreated).reversed());
        return scraps;
    }

    public Scrap getByPostAndUser(Post post, User user){
        return scrapRepository.findByPostAndUser(post, user)
                .orElseThrow(()->new ResourceNotFoundException("does not exists Scrap, postId="+post.getId()+", userId="+user.getId()));
    }

    public boolean isScraped(Post post, User user){
        try{
            getByPostAndUser(post, user);
            return true;
        } catch (RuntimeException e){
            return false;
        }
    }
    @Transactional
    public void createScrap(Post post, User user){
        Scrap scrap = Scrap.builder()
                .post(post)
                .user(user)
                .build();

        scrapRepository.save(scrap);
    }
    @Transactional
    public void cancelScrap(Post post, User user){
        Scrap scrap = getByPostAndUser(post, user);
        scrapRepository.delete(scrap);
    }
}
