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
import com.example.highteenday_backend.enums.ErrorCode;
import com.example.highteenday_backend.exceptions.CustomException;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import com.example.highteenday_backend.services.domain.redisService.PostPrevCache;
import com.example.highteenday_backend.services.global.AfterCommitExecutor;
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
    private final AfterCommitExecutor afterCommitExecutor;
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
        // 정렬 속성은 컬럼명이 아니라 엔티티 필드명(created)이어야 QPost 경로로 해석된다.
        Sort sort = Sort.by(Sort.Direction.DESC, "created");
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

        // 캐시 갱신은 커밋 이후로 미룬다. 커밋 전에 실으면 이후 롤백 시 존재하지 않는
        // 게시글이 TTL 만료까지 목록 캐시에 남고 게시판 카운트도 어긋난다 (KI-22).
        // DTO 는 여기서 만든다 — 커밋 후에는 영속성 컨텍스트가 닫혀 지연 로딩이 깨진다.
        Long boardId = post.getBoard().getId();
        PostPreviewDto preview = PostPreviewDto.fromEntity(post);
        afterCommitExecutor.run(() -> {
            postPrevCache.evictBoard(boardId);
            postPrevCache.cachePostPrev(preview);
            postPrevCache.incrementBoardCount(boardId);
        });

        return savedPost;
    }
    // 예전에는 dto 에 @Valid 가 붙어 있었지만 이 클래스에 @Validated 가 없어 아무 일도
    // 하지 않는 장식이었다 (docs/KNOWN-ISSUES.md KI-16). 검증은 웹 계층에서 한다 —
    // 컨트롤러의 @RequestBody 에 @Valid 를 걸어 두었고, 그쪽이 실패를 400 으로
    // 내보내는 정식 통로다. 여기 남겨 두면 "검증되고 있다"는 착각만 준다.
    @Transactional
    public void updatePost(Long postId,Long userId, UpdatePostDto dto){
        String newTile = dto.getTitle();
        String newContent = dto.getContent();

        Post post = findById(postId);
        validateOwnership(post, userId);
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
        validateOwnership(post, userId);
        post.delete();
        post.setUpdatedBy(userId);

        // 생성과 같은 이유로 커밋 이후에 처리한다. 삭제가 롤백되면 살아 있는 글이
        // 목록에서 사라지고 카운트가 하나 모자란 채로 남는다 (KI-22).
        Long boardId = post.getBoard().getId();
        afterCommitExecutor.run(() -> {
            postPrevCache.evictBoard(boardId);
            postPrevCache.evictPostPrev(postId);
            postPrevCache.decrementBoardCount(boardId);
        });
        log.info("post delete. postId = {}, deletedBy = {}", post.getId(), userId);
        return post;
    }

    /**
     * Redis 에 버퍼링된 조회수 증가분을 게시글에 반영한다 ({@code ViewCountScheduler} 전용).
     *
     * <p>이 메서드가 스케줄러가 아니라 여기 있는 이유: 예전에는 스케줄러가
     * {@code this.applyViewCount()} 로 자기 자신을 직접 불러 {@code @Transactional} 이
     * 프록시를 거치지 않았고, 배치 전체가 바깥 트랜잭션 하나로 묶였다. 그러면 게시글
     * 하나의 실패가 그 주기 전체를 되돌린다 (docs/KNOWN-ISSUES.md KI-23).
     * 별도 빈의 메서드로 옮기면 호출이 프록시를 타므로 <b>게시글 하나당 트랜잭션 하나</b>가
     * 실제로 성립한다.
     */
    @Transactional
    public void applyViewCount(Long postId, int increment) {
        Post post = findById(postId);
        post.addViewCount(increment);
        log.debug("View count applied. postId={}, increment={}", postId, increment);
    }

    /**
     * 요청자가 글 작성자인지 확인한다 (docs/KNOWN-ISSUES.md KI-05).
     *
     * 컨트롤러가 아니라 서비스에 두는 이유: 수정·삭제 경로가 컨트롤러 외에
     * 스케줄러나 다른 서비스에서도 불릴 수 있고, 그때 검증이 빠지면 같은 구멍이
     * 다시 생긴다. {@code NotificationService.validateOwnership()},
     * {@code ChatService.requireParticipant()} 와 같은 자리다.
     *
     * 익명 글도 작성자 id 는 남아 있으므로 판정 기준은 동일하다.
     */
    private void validateOwnership(Post post, Long userId) {
        if (userId == null || !post.getUser().getId().equals(userId)) {
            throw new CustomException(ErrorCode.NO_ACCESS);
        }
    }



}
