package com.example.highteenday_backend.domain.scraps;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ScrapRepository extends JpaRepository<Scrap, Long> {
    @Query("select s from Scrap s where s.post = :post and s.user = :user")
    Optional<Scrap> findByPostAndUser(Post post, User user);

    @Query("select s from Scrap s where s.user = :user and s.isValid = true")
    List<Scrap> findByUser(User user);

    /**
     * 마이페이지 스크랩 목록. 페이지에 필요한 행만 DB에서 잘라 오고,
     * 미리보기에 필요한 값만 직접 투영해 게시글/게시판/작성자 지연 로딩을 없앤다.
     *
     * <p>작성자 표기는 비정규화된 p.nickname("익명" 또는 실명)을 사용한다.
     */
    @Query(value = """
            select new com.example.highteenday_backend.dtos.PostPreviewDto(
                p.id, p.board.id, p.nickname, p.title, p.viewCount, p.likeCount, p.commentCount, p.created)
            from Scrap s join s.post p
            where s.user = :user and s.isValid = true and p.isValid = true
            order by s.created desc
            """,
            countQuery = """
            select count(s) from Scrap s join s.post p
            where s.user = :user and s.isValid = true and p.isValid = true
            """)
    Page<PostPreviewDto> findScrappedPostPreviews(@Param("user") User user, Pageable pageable);

    @Query("select count(s) from Scrap s where s.post = :post and s.isValid = true")
    long countValidByPost(@Param("post") Post post);
}
