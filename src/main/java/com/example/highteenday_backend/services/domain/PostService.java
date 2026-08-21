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
import com.example.highteenday_backend.services.domain.redisService.PostPrevCache;
import jakarta.validation.Valid;
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
    private final MediaProcessingService mediaProcessingService;
    private final PostPrevCache postPrevCache;
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

    /**
     * 게시글 목록 조회. 캐시는 "최신순 + 캐시가 담는 범위 안" 에만 적용한다 —
     * 트래픽 대부분이 이 구간에 몰리고, 정렬 조건별로 캐시를 다 두면
     * 무효화 비용이 커지기 때문이다. 그 외 조건은 DB(QueryDSL) 직행.
     *
     * 판정은 페이지 번호가 아니라 조회 끝 인덱스로 한다. 캐시는 최신 글
     * {@value PostPrevCache#MAX_CACHED_POSTS} 개만 담으므로 page 가 작아도 size 가 크면
     * 구간이 캐시 밖으로 나가고, 그러면 캐시는 빈 목록밖에 줄 수 없다 (KI-57).
     */
    public List<PostPreviewDto> getPagedPosts(PostListingDto dto) {
        long endIndexExclusive = (long) (dto.getPage() + 1) * dto.getSize();
        if (endIndexExclusive <= PostPrevCache.MAX_CACHED_POSTS && dto.getSortType() == SortType.RECENT) {
            return postPrevCache.getPostPrevs(dto.getBoardId(), dto.getPage(), dto.getSize());
        }
        return postRepository.findByBoard(dto);
    }

    public Long getPostCount(Long boardId) {
        return postPrevCache.getCount(boardId);
    }

    @Transactional
    public Post createPost(User user,RequestPostDto dto){
        Board board = boardService.findById(dto.getBoardId());

        Post post = Post.create(user, board, dto.getTitle(), dto.getContent(), dto.isAnonymous());
        Post savedPost = postRepository.save(post);
        mediaProcessingService.processCreatePostMedia(user.getId(),post);
        post.setUpdatedDate(null);

        // 주의: 아직 트랜잭션 커밋 전에 캐시를 갱신한다. 이후 롤백되면 존재하지 않는
        // 게시글이 목록 캐시에 남는다 (TTL 만료까지) — docs/KNOWN-ISSUES.md KI-22.
        postPrevCache.evictBoard(post.getBoard().getId());
        postPrevCache.cachePostPrev(PostPreviewDto.fromEntity(post));
        postPrevCache.incrementBoardCount(post.getBoard().getId());

        return savedPost;
    }
    @Transactional
    public void updatePost(Long postId,Long userId, @Valid UpdatePostDto dto){
        String newTile = dto.getTitle();
        String newContent = dto.getContent();

        Post post = findById(postId);
        String oldTiltle = post.getTitle();
        String oldContent = post.getContent();
        if(!newTile.equals(oldTiltle)) {
            post.editTitle(newTile);
        }
        if(!newContent.equals(oldContent)) {
            mediaProcessingService.processUpdatePostMedia(userId,post,newContent,oldContent);
        }
        log.debug("[Post Update] request - postId={}, newTitle={}, newContent={}",postId,newTile,newContent);
        log.debug("[Post Update] old post data - oldTitle={}, oldContent={}",post.getTitle(),post.getContent());
        log.info("[Post Update] success, postId={}, updateBy={}",post.getId(),post.getUpdatedBy());
    }
    @Transactional
    public Post deletePost(Long postId,Long userId) {
        Post post = findById(postId);
        post.delete();
        post.setUpdatedBy(userId);
        postPrevCache.evictBoard(post.getBoard().getId());
        postPrevCache.evictPostPrev(postId);
        postPrevCache.decrementBoardCount(post.getBoard().getId());
        log.info("post delete. postId = {}, deletedBy = {}", post.getId(), userId);
        return post;
    }



}
