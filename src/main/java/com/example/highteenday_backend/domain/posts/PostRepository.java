package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PostRepository extends JpaRepository<Post,Long> {

    @Query("select p from Post p where p.isValid = true and p.id = :postId ")
    public Optional<Post> findById(Long postId);

//    @Modifying
//    @Query("update Post p Set p.title=:title,p.content=:content where p.id=:postId")
//    public int updatePost(Long postId,String title,String content);
//
//    public List<Post> findByBoardId(Long boardId);

    @Query("select p from Post p where p.isValid = true and p.board =:board ")
    public Page<Post> findByBoard(Board board, Pageable pageable);
    @Query("select p from Post p where p.isValid = true and p.user =:user ")
    public Page<Post> findByUser(User user, Pageable pageable);


}
