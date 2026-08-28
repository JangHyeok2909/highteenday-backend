package com.example.highteenday_backend.domain.friends;


import com.example.highteenday_backend.domain.users.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 친구 관계 조회.
 *
 * <p><b>모든 쿼리가 {@code is_valid = true} 를 건다.</b> 친구 삭제는 물리 삭제가 아니라
 * soft delete 이므로(docs/KNOWN-ISSUES.md KI-43, KI-34 와 같은 계열), 필터를 빠뜨리면
 * 이미 끊은 친구가 목록·권한 판정에 계속 살아 있게 된다. 새 쿼리를 추가할 때도 반드시 넣을 것.
 */
public interface FriendRepository extends JpaRepository<Friend, Long> {

    // 모든 친구 검색
    @Query(value = """
            SELECT u.*
            FROM friends f JOIN users u ON f.USR_frd_id = u.USR_id
            WHERE f.USR_id = :id AND f.FRD_status = 'FRIEND' AND f.is_valid = true
            
            UNION
            
            SELECT u.*
            FROM friends f JOIN users u ON f.USR_id = u.USR_id
            WHERE f.USR_frd_id = :id AND f.FRD_status = 'FRIEND' AND f.is_valid = true
            """, nativeQuery = true)
    List<User> findAllFriends(@Param("id") Long userId);


    // A, B 친구 관계 검색
    @Query(value = """
            SELECT f.*
            FROM friends f
            WHERE f.is_valid = true
              AND ((f.USR_id = :me AND f.USR_frd_id = :friend)
                OR (f.USR_id = :friend AND f.USR_frd_id = :me))
            """, nativeQuery = true)
    List<Friend> findFriendsRelations(@Param("me") Long meId, @Param("friend") Long friendId);

    // 후보 목록 중 나와 친구인 사용자 ID만 추린다. 단체방 초대 시 1인 1쿼리를 피하기 위함.
    @Query(value = """
            SELECT f.USR_frd_id
            FROM friends f
            WHERE f.USR_id = :me AND f.FRD_status = 'FRIEND' AND f.is_valid = true
              AND f.USR_frd_id IN (:candidates)

            UNION

            SELECT f.USR_id
            FROM friends f
            WHERE f.USR_frd_id = :me AND f.FRD_status = 'FRIEND' AND f.is_valid = true
              AND f.USR_id IN (:candidates)
            """, nativeQuery = true)
    List<Long> findFriendIdsAmong(@Param("me") Long meId,
                                  @Param("candidates") Collection<Long> candidateIds);

    // findFriendIdsAmong의 상호 판정 버전. 한쪽만 FRIEND인 관계(= 상대가 나를 차단)는 제외하므로
    // existsFriendship과 결과가 일치한다. 친구 배지와 시간표 조회 권한이 어긋나지 않으려면
    // 두 곳이 같은 기준을 써야 한다.
    @Query(value = """
            SELECT f1.USR_frd_id
            FROM friends f1
            WHERE f1.USR_id = :me
              AND f1.FRD_status = 'FRIEND'
              AND f1.is_valid = true
              AND f1.USR_frd_id IN (:candidates)
              AND EXISTS (
                  SELECT 1 FROM friends f2
                  WHERE f2.USR_id = f1.USR_frd_id
                    AND f2.USR_frd_id = :me
                    AND f2.FRD_status = 'FRIEND'
                    AND f2.is_valid = true
              )
            """, nativeQuery = true)
    List<Long> findMutualFriendIdsAmong(@Param("me") Long meId,
                                        @Param("candidates") Collection<Long> candidateIds);

    // A B가 서로 차단하지 않은 친구 관계인지 확인
    @Query("""
            SELECT CASE WHEN COUNT(f1) > 0 THEN true ELSE false END
            FROM Friend f1
            WHERE f1.user.id = :me AND f1.friend.id = :friend
                AND f1.status = com.example.highteenday_backend.enums.FriendStatus.FRIEND
                AND f1.isValid = true
                AND EXISTS (
                    SELECT 1
                    FROM Friend f2
                    WHERE f2.user.id = :friend AND f2.friend.id = :me
                        AND f2.status = com.example.highteenday_backend.enums.FriendStatus.FRIEND
                        AND f2.isValid = true
                )
            """)
    boolean existsFriendship(@Param("me") Long meId, @Param("friend") Long friendId);

    // A B의 차단 관계 검색( A 기준 )
    Optional<Friend> findByUserAndFriendAndIsValidTrue(User user, User friend);

}
