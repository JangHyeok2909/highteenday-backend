package com.example.highteenday_backend.domain.scraps;

import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ScrapRepository extends JpaRepository<Scrap, Long> {
    @Query("select s from Scrap s where s.post=:post and s.user = :user and s.isValid=true ")
    Optional<Scrap> findByPostAndUser(Post post, User user);

    @Query("select s from Scrap s where s.user = :user and s.isValid=true")
    List<Scrap> findByUser(User user);

}
