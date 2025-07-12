package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostDislike;
import com.example.highteenday_backend.domain.posts.PostDislikeRepository;
import com.example.highteenday_backend.domain.users.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

@RequiredArgsConstructor
@Service
public class PostDislikeService {
    private final PostDislikeRepository postDislikeRepository;


    public boolean isDislikedByUser(Post post, User user){
        Optional<PostDislike> postDislike = postDislikeRepository.findByPostAndUser(post, user);
        if(postDislike.isEmpty()) return false;
        return true;
    }
    public PostDislike createDislike(Post post, User user){
        Optional<PostDislike> postDislike = postDislikeRepository.findByPostAndUser(post, user);
        if(postDislike.isEmpty()){
            PostDislike newPostDislike = PostDislike.builder().post(post).user(user).build();
            return postDislikeRepository.save(newPostDislike);
        } else {
            return postDislike.get();
        }
    }

    public void cancelDislike(Post post, User user){
        Optional<PostDislike> postDislike = postDislikeRepository.findByPostAndUser(post, user);
        if(postDislike.isEmpty()) return;
        postDislikeRepository.delete(postDislike.get());
    }
}
