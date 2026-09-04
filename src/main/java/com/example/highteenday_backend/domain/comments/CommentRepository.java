package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CommentRepository extends JpaRepository<Comment,Long> {
    /**
     * 게시글의 댓글 목록. 작성자를 함께 읽는다.
     *
     * `join fetch c.user` 가 없으면 `Comment.user` 가 LAZY 라
     * `CommentDto.fromEntity` 가 닉네임을 읽는 순간 **서로 다른 작성자 수만큼** SELECT 가
     * 따로 나간다(OPT-002). 댓글 500개짜리 글에서 그것이 요청당 쿼리 112개 중 108개였다.
     *
     * `@ManyToOne` 이라 fetch join 이 행을 부풀리지 않는다 — 댓글 한 건에 작성자는 한 명뿐이라
     * 결과 행 수가 그대로다. 컬렉션 fetch join 과 달리 중복 제거도, 페이징 제약도 없다.
     * `USR_id` 가 NOT NULL 이므로 `left join` 이 아닌 내부 조인으로 충분하다.
     */
    @Query("select c from Comment c join fetch c.user where c.isValid=true and c.post=:post")
    public List<Comment> findByPost(Post post);
    @Query("select c from Comment c where c.isValid = true and c.user =:user ")
    public Page<Comment> findByUser(User user, Pageable pageable);
}
