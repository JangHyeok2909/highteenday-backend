package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.scraps.Scrap;
import com.example.highteenday_backend.domain.scraps.ScrapRepository;
import com.example.highteenday_backend.domain.users.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@RequiredArgsConstructor
@Service
public class ScrapService {
    private final ScrapRepository scrapRepository;
    public Scrap findByPostAndUser(Post post, User user){
        return scrapRepository.findByPostAndUser(post, user)
                .orElseThrow(()->new RuntimeException("does not exists Scrap, postId="+post.getId()+", userId="+user.getId()));
    }
    public boolean isScraped(Post post, User user){
        try{
            findByPostAndUser(post, user);
            return true;
        } catch (RuntimeException e){
            return false;
        }
    }
    public void createScrap(Post post, User user){
        Scrap scrap = Scrap.builder()
                .post(post)
                .user(user)
                .build();
        scrapRepository.save(scrap);
    }

    public void cancelScrap(Post post, User user){
        Scrap scrap = findByPostAndUser(post, user);
        scrapRepository.delete(scrap);
    }

}
