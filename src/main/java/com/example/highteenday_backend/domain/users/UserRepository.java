package com.example.highteenday_backend.domain.users;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    // 이메일로 검색
    Optional<User> findByEmail(String email);

    // 이름으로 검색 ( 이름은 중복 될 수 있으니까 List 로 )
    List<User> findByName(String name);

    // 닉네임으로 검색
    Optional<User> findByNickname(String nickname);

    boolean existsByNickname(String newNickname);
}
