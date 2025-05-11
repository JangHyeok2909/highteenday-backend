package com.example.highteenday_backend.domain.medias;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MediaRepository extends JpaRepository<Media,Long> {

    public Optional<Media> findByUrl(String url);
}
