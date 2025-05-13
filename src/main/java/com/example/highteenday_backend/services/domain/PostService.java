package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.boards.BoardRepository;
import com.example.highteenday_backend.domain.posts.PostLikeRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Slf4j
@RequiredArgsConstructor
@Service
public class PostService {
    private final PostLikeRepository postLikeRepository;
    private final PostRepository postRepository;
    private final UserRepository userRepository;
    private final BoardRepository boardRepository;

    public Post findById(Long postId){
        return postRepository.findById(postId)
                .orElseThrow(()->new RuntimeException("post does not exist, postId="+postId));
    }

    public Page<Post> getPosts(Long boardId,int page,int size,String sortType){
        Sort sort;
        if(sortType.equals("like")) sort = Sort.by("likeCount").descending();
        else if(sortType.equals("view")) sort = Sort.by("viewCount").descending();
        else sort = Sort.by("createAt").descending();

        Pageable pageable = PageRequest.of(page, size, sort);
        Page<Post> postPages = postRepository.findByBoardId(boardId, pageable);
        return postPages;
    }

    //로그남기기
    @Transactional
    public Post createPost(Long userId,Long boardId,boolean isAnonymous,String title,String content){
        User user = userRepository.findById(userId).get();
        Board board = boardRepository.findById(boardId).get();
        Post post = Post.builder().user(user).board(board).isAnonymous(isAnonymous).title(title).content(content).build();
        post.setCreated(LocalDateTime.now());
        return postRepository.save(post);
    }

    //로그 남기기,이미지 업로드
    @Transactional
    public void updatePost(Long postId,String title, String content){
        Post post = findById(postId);
        post.updateTitle(title);
        post.updateContent(content);
    }

    @Transactional
    public int updateLikeCount(Post post){
        int updatedLikeCount = postLikeRepository.findRecentLikes(post).size();
        post.updateLikeCount(updatedLikeCount);
        log.info("update likeCount, postId={},likeCount={}",post.getId(),post.getLikeCount());
        return updatedLikeCount;
    }




}
