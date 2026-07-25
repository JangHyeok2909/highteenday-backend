package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CommentRepository extends JpaRepository<Comment,Long> {

    /**
     * 반응 카운터 재집계는 "COUNT 후 엔티티에 반영"하는 read-modify-write라
     * 잠금 없이 동시에 수행하면 갱신 손실이 발생한다. 재집계 전에 댓글 행을 잠근다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Comment c where c.id = :commentId")
    Optional<Comment> findByIdForUpdate(@Param("commentId") Long commentId);

    // CommentDto.fromEntity가 작성자와 게시글을 즉시 사용하므로 함께 로딩한다.
    @Query("select c from Comment c join fetch c.user join fetch c.post where c.isValid=true and c.post=:post")
    public List<Comment> findByPost(Post post);

    @Query(value = "select c from Comment c join fetch c.user join fetch c.post where c.isValid = true and c.user =:user",
            countQuery = "select count(c) from Comment c where c.isValid = true and c.user =:user")
    public Page<Comment> findByUser(User user, Pageable pageable);
}
