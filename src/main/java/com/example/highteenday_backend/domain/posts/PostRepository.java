package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.queryDsl.PostRepositoryCustom;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PostRepository extends JpaRepository<Post,Long>, PostRepositoryCustom {

    @Query("select p from Post p where p.isValid = true and p.id = :postId ")
    public Optional<Post> findById(Long postId);

    /**
     * 댓글 수 증감 — DB에서 원자적으로 계산한다.
     *
     * 엔티티에서 `commentCount++` 하던 방식은 읽고-더하고-쓰기라, 같은 게시글에 동시에
     * 댓글이 달리면 나중 트랜잭션이 앞선 증가분을 덮어썼다. `Post`에 `@Version`이 없어
     * 충돌이 예외로도 드러나지 않고 조용히 지나갔다. large 데이터셋 실측에서 70개 게시글의
     * 카운터가 실제보다 적었고(전부 과소, 과다 0건) 합계로 13,284건이 비어 있었다.
     * 인기글일수록 동시 쓰기가 많아 더 많이 유실되므로, 가장 인기 있는 글이 가장 크게
     * 손해를 본다 — 단일 게시글 최대 손실이 11,096건이었다.
     *
     * 스크랩·반응 카운터는 `COUNT(*)` 재계산 후 대입이라 같은 조건에서 불일치가 0건·3건이다.
     * 그쪽처럼 재계산으로 맞출 수도 있지만, 댓글은 인기글에 수만 건이 붙어 매 요청마다
     * 세는 비용이 크다. 원자 증감은 추가 조회 없이 유실을 원리적으로 없앤다.
     *
     * `flushAutomatically`로 앞선 변경을 먼저 내보내고, `clearAutomatically`로 영속성
     * 컨텍스트를 비운다 — 비우지 않으면 이 UPDATE 이후에도 1차 캐시의 낡은 값이 읽힌다.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Post p set p.commentCount = p.commentCount + 1 where p.id = :postId")
    int incrementCommentCount(@Param("postId") Long postId);

    /** 0 미만으로 내려가지 않게 조건을 건다 — 기존 엔티티 메서드의 `if (count > 0)`와 같은 의도다. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Post p set p.commentCount = p.commentCount - 1 where p.id = :postId and p.commentCount > 0")
    int decrementCommentCount(@Param("postId") Long postId);

    @Query("""
    select p
    from Post p
    join fetch p.user
    where p.isValid = true
    and p.board = :board
    """)
    public Page<Post> findByBoard(Board board, Pageable pageable);

    @Query("SELECT new com.example.highteenday_backend.dtos.PostPreviewDto(p.id, p.board.id, p.user.nickname.value,p.title, p.viewCount, p.likeCount, p.commentCount,p.created) "
            + "FROM Post p WHERE p.id IN :ids")
    List<PostPreviewDto> findAllDtoByIds(List<Long> ids);


    @Query("select p from Post p where p.isValid = true and p.user =:user ")
    public Page<Post> findByUser(User user, Pageable pageable);

    public List<Post> findByUser(User user);

    public List<Post> findByTitleContaining(String title);
    public List<Post> findByContentContaining(String content);

    List<Post> findByTitleContainingOrContentContaining(String title, String content);




}
