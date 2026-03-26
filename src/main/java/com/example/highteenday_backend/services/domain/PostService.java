package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.dtos.RequestPostDto;
import com.example.highteenday_backend.dtos.UpdatePostDto;
import com.example.highteenday_backend.dtos.paged.PageResponse;
import com.example.highteenday_backend.dtos.paged.PostListingDto;
import com.example.highteenday_backend.enums.PostSearchType;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Slf4j
@RequiredArgsConstructor
@Service
public class PostService {
    private final PostRepository postRepository;
    private final BoardService boardService;
    private final PostMediaService postMediaService;
    private final static int SIZE = 10;

    public Post findById(Long postId) {
        return postRepository.findById(postId)
                .orElseThrow(() -> new ResourceNotFoundException("post does not exist, postId=" + postId));
    }

    public Optional<Post> findOptionalById(Long postId) {
        return postRepository.findById(postId);
    }
    public List<Post> getPostsByUser(User user){
        return postRepository.findByUser(user);
    }
    public List<Post> findAll(){
        return postRepository.findAll();
    }

    public Page<Post> searchPagedPosts(String query,int page, PostSearchType searchType){
        Sort sort = Sort.by(Sort.Direction.ASC, "createdAt").descending();
        Pageable pageable = PageRequest.of(page,SIZE, sort);
        Page<Post> pagedPost;
        pagedPost = postRepository.searchKeywordsAll(query, searchType,pageable);
        return pagedPost;
    }

    public Page<Post> getPagedPostsByUser(User user, int page, int size, SortType sortType){
        Sort sort = Sort.by(Sort.Direction.DESC, sortType.getField());

        Pageable pageable = PageRequest.of(page, size, sort);
        return postRepository.findByUser(user, pageable);
    }

    public List<PostPreviewDto> getPagedPosts(PostListingDto dto){
        return postRepository.findByBoard(dto);
    }

//    public PageResponse<PostPreviewDto> getPagedPosts(List<PostPreviewDto> dtos){
//        Long total = postRepository.countTotal(dto);
//    }

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
                .nickname(dto.isAnonymous() ? "익명":user.getNickname())
                .build();
        Post savedPost = postRepository.save(post);
        postMediaService.processCreatePostMedia(user.getId(),post);
        post.setUpdatedDate(null);
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
