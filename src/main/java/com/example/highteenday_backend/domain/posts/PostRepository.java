package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.queryDsl.PostRepositoryCustom;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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
     * 반응 카운터 재집계는 "COUNT 후 엔티티에 반영"하는 read-modify-write라
     * 잠금 없이 동시에 수행하면 갱신 손실이 발생한다. 재집계 전에 게시글 행을 잠근다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Post p where p.id = :postId")
    Optional<Post> findByIdForUpdate(@Param("postId") Long postId);

//    @Modifying
//    @Query("update Post p Set p.title=:title,p.content=:content where p.id=:postId")
//    public int updatePost(Long postId,String title,String content);
//
//    public List<Post> findByBoardId(Long boardId);

    @Query("""
    select p
    from Post p
    join fetch p.user
    where p.isValid = true
    and p.board = :board
    """)
    public Page<Post> findByBoard(Board board, Pageable pageable);

    // 작성자 표기는 반드시 비정규화된 p.nickname("익명" 또는 실명)을 써야 한다.
    // p.user.nickname을 조인하면 익명 글에도 실명이 실려나간다.
    @Query("SELECT new com.example.highteenday_backend.dtos.PostPreviewDto(p.id, p.board.id, p.nickname, p.title, p.viewCount, p.likeCount, p.commentCount, p.created) "
            + "FROM Post p WHERE p.id IN :ids")
    List<PostPreviewDto> findAllDtoByIds(List<Long> ids);


    @Query("select p from Post p where p.isValid = true and p.user =:user ")
    public Page<Post> findByUser(User user, Pageable pageable);

    public List<Post> findByUser(User user);

    public List<Post> findByTitleContaining(String title);
    public List<Post> findByContentContaining(String content);

    List<Post> findByTitleContainingOrContentContaining(String title, String content);




}
