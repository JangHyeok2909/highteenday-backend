package com.example.highteenday_backend.domain.users;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * 이메일로 사용자를 찾는다. <b>탈퇴한 계정은 찾지 않는다</b> (docs/KNOWN-ISSUES.md KI-34).
     *
     * <p>탈퇴 시 이메일이 표식값으로 바뀌므로 원래 이메일로는 어차피 안 잡히지만,
     * 인증·토큰 재발급이 전부 이 메서드를 지나므로 지움 표시도 함께 걸러 이중으로 막는다.
     */
    @Query("SELECT u FROM User u WHERE u.email.value = :email AND u.isValid = true")
    Optional<User> findByEmail(@Param("email") String email);

    @Query("SELECT u FROM User u WHERE u.name.value = :name")
    List<User> findByName(@Param("name") String name);

    @Query("SELECT u FROM User u WHERE u.nickname.value = :nickname")
    Optional<User> findByNickname(@Param("nickname") String nickname);

    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u WHERE u.nickname.value = :nickname")
    boolean existsByNickname(@Param("nickname") String nickname);

    /** 가입 시 중복 확인용. 탈퇴 계정은 이메일이 표식값으로 비켜 있어 여기 걸리지 않는다 (KI-34). */
    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u WHERE u.email.value = :email AND u.isValid = true")
    boolean existsByEmail(@Param("email") String email);

    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u WHERE u.phone.value = :phone")
    boolean existsByPhone(@Param("phone") String phone);
}
