package com.example.highteenday_backend.domain.posts;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PostRepository extends JpaRepository<Post,Long> {

    @Modifying
    @Query("update Post p Set p.title=:title,p.content=:content where p.id=:postId")
    public int updatePost(Long postId,String title,String content);

    public List<Post> findByBoardId(Long boardId);

    public Page<Post> findByBoardId(Long boardId, Pageable pageable);


}
