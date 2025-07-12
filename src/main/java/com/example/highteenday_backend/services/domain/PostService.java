package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.PostLikeRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.enums.PostSortType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@RequiredArgsConstructor
@Service
public class PostService {
    private final PostLikeRepository postLikeRepository;
    private final PostRepository postRepository;
    private final UserService userService;
    private final BoardService boardService;

    public Post findById(Long postId){
        return postRepository.findById(postId)
                .orElseThrow(()->new RuntimeException("post does not exist, postId="+postId));
    }

    public Page<Post> getPosts(Long boardId, int page, int size, PostSortType postSortType){
        Sort sort = Sort.by(postSortType.getField()).descending();

        Board board = boardService.findById(boardId);
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<Post> postPages = postRepository.findByBoard(board, pageable);
        return postPages;
    }

    //로그남기기
    @Transactional
    public Post createPost(RequestPostDto dto){
        User user = userService.findById(dto.getUserId());
        Board board = boardService.findById(dto.getBoardId());

        Post post = Post.builder()
                .user(user)
                .board(board)
                .isAnonymous(dto.isAnonymous())
                .title(dto.getTitle())
                .content(dto.getContent())
                .build();
        return postRepository.save(post);
    }
    @Transactional
    public void deletePost(Long postId,Long userId) {
        Post post = findById(postId);
        post.delete();
        post.setUpdatedBy(userId);
        log.info("post delete. postId = {}, deletedBy = {}", post.getId(), userId);
    }

    //로그 남기기,이미지 업로드
    @Transactional
    public void updatePost(Long postId,String title, String content){
        log.info("[Post Update] request - postId={}, newTitle={}, newContent={}",postId,title,content);

        Post post = findById(postId);
        log.debug("[Post Update] old post data - oldTitle={}, oldContent={}",post.getTitle(),post.getContent());
        post.updateTitle(title);
        post.updateContent(content);
        log.info("[Post Update] success, postId={}, updateBy={}",post.getId(),post.getUpdatedBy());
    }
}
