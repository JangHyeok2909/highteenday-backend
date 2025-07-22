package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.dtos.UpdatePostDto;
import com.example.highteenday_backend.enums.SortType;
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
    private final PostRepository postRepository;
    private final UserService userService;
    private final BoardService boardService;
    private final PostMediaService postMediaService;

    public Post findById(Long postId) {
        return postRepository.findById(postId)
                .orElseThrow(() -> new RuntimeException("post does not exist, postId=" + postId));
    }

    public Page<Post> getPagedPostsByUser(User user, int page, int size, SortType sortType){
        Sort sort = Sort.by(Sort.Direction.DESC, sortType.getField());

        Pageable pageable = PageRequest.of(page, size, sort);
        Page<Post> postPages = postRepository.findByUser(user, pageable);
        if(postPages.isEmpty()) {
            throw new RuntimeException(String.format("post is empty. userId=%d, page=%d, size=%d",user.getId(),page,size));
        }
        return postPages;
    }


    public Page<Post> getPagedPostsByBoardId(Long boardId, int page, int size, SortType sortType){
        Sort sort = Sort.by(Sort.Direction.DESC, sortType.getField());

        Board board = boardService.findById(boardId);
        Pageable pageable = PageRequest.of(page, size, sort);
        Page<Post> postPages = postRepository.findByBoard(board, pageable);
        if(postPages.isEmpty()) {
            throw new RuntimeException(String.format("post is empty. boardId=%d, page=%d, size=%d",boardId,page,size));
        }
        return postPages;
    }

    //로그남기기
    @Transactional
    public Post createPost(User user,RequestPostDto dto){
        Board board = boardService.findById(dto.getBoardId());

        Post post = Post.builder()
                .user(user)
                .board(board)
                .isAnonymous(dto.isAnonymous())
                .title(dto.getTitle())
                .content(dto.getContent())
                .build();
        Post savedPost = postRepository.save(post);
        postMediaService.processCreatePostMedia(user.getId(),post);
        return savedPost;
    }
    //로그 남기기,이미지 업로드
    @Transactional
    public void updatePost(Long postId,Long userId, UpdatePostDto dto){
        String newTile = dto.getTitle();
        String newContent = dto.getContent();

        Post post = findById(postId);
        String oldTiltle = post.getTitle();
        String oldContent = post.getContent();
        if(!newTile.equals(oldTiltle)) {
            post.updateTitle(newTile);
        }
        if(!newContent.equals(oldContent)) {
            postMediaService.processUpdatePostMedia(userId,post,newContent,oldContent);
        }
        log.info("[Post Update] request - postId={}, newTitle={}, newContent={}",postId,newTile,newContent);
        log.debug("[Post Update] old post data - oldTitle={}, oldContent={}",post.getTitle(),post.getContent());
        log.info("[Post Update] success, postId={}, updateBy={}",post.getId(),post.getUpdatedBy());
    }
    @Transactional
    public void deletePost(Long postId,Long userId) {
        Post post = findById(postId);
        post.delete();
        post.setUpdatedBy(userId);
        log.info("post delete. postId = {}, deletedBy = {}", post.getId(), userId);
    }



}
