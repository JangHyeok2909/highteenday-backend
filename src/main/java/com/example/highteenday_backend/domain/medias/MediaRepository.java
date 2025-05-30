package com.example.highteenday_backend.domain.medias;

import com.example.highteenday_backend.domain.comments.Comment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MediaRepository extends JpaRepository<Media,Long> {

    public Optional<Media> findByUrl(String url);
    public Optional<Media> findByComment(Comment comment);

}
