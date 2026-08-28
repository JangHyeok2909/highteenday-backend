package com.example.highteenday_backend.domain.friends;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.configs.JpaAuditingConfig;
import com.example.highteenday_backend.queryDsl.QueryDslConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
// JpaAuditingConfig 를 명시적으로 넣는다. @EnableJpaAuditing 은 애플리케이션 클래스가 아니라
// 별도 설정 클래스에 있고(KI-52), @DataJpaTest 는 그런 @Configuration 을 자동으로 올리지 않는다.
// 빠뜨리면 BaseEntity.created 가 null 이라 NOT NULL 제약에 걸려 저장 자체가 실패한다.
@Import({QueryDslConfig.class, JpaAuditingConfig.class})
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.sql.init.mode=never"
})
class FriendRepositoryTest {

    @Autowired
    private FriendRepository friendRepository;
    @Autowired
    private UserRepository userRepository;

    private User me;
    private User friend;

    @BeforeEach
    void setUp() {
        me = userRepository.save(newUser("me@test.com", "me"));
        friend = userRepository.save(newUser("friend@test.com", "friend"));
    }

    @Test
    @DisplayName("서로 FRIEND 관계면 true를 반환한다")
    void existsFriendship_bothDirections() {
        friendRepository.save(Friend.createFriendship(me, friend));
        friendRepository.save(Friend.createFriendship(friend, me));

        assertThat(friendRepository.existsFriendship(me.getId(), friend.getId())).isTrue();
    }

    @Test
    @DisplayName("한쪽만 FRIEND 관계면 false를 반환한다")
    void existsFriendship_oneDirectionOnly() {
        friendRepository.save(Friend.createFriendship(me, friend));

        assertThat(friendRepository.existsFriendship(me.getId(), friend.getId())).isFalse();
    }

    @Test
    @DisplayName("상대가 나를 차단했다면 false를 반환한다")
    void existsFriendship_blocked() {
        friendRepository.save(Friend.createFriendship(me, friend));
        friendRepository.save(Friend.createBlock(friend, me));

        assertThat(friendRepository.existsFriendship(me.getId(), friend.getId())).isFalse();
    }

    // ── soft delete 필터 (docs/KNOWN-ISSUES.md KI-43) ──
    // 친구 삭제가 물리 삭제에서 soft delete 로 바뀌었으므로, 조회 쿼리가 is_valid 를
    // 걸러 주지 않으면 **이미 끊은 친구가 계속 친구로 보인다.** 아래 네 테스트는
    // 쿼리 하나라도 필터를 빠뜨리면 깨진다.

    @Test
    @DisplayName("soft delete 된 관계는 친구로 보지 않는다")
    void existsFriendship_ignoresSoftDeleted() {
        Friend forward = friendRepository.save(Friend.createFriendship(me, friend));
        friendRepository.save(Friend.createFriendship(friend, me));
        assertThat(friendRepository.existsFriendship(me.getId(), friend.getId())).isTrue();

        forward.delete();
        friendRepository.saveAndFlush(forward);

        assertThat(friendRepository.existsFriendship(me.getId(), friend.getId())).isFalse();
    }

    @Test
    @DisplayName("soft delete 된 관계는 친구 목록에 나오지 않는다")
    void findAllFriends_ignoresSoftDeleted() {
        Friend forward = friendRepository.save(Friend.createFriendship(me, friend));
        Friend backward = friendRepository.save(Friend.createFriendship(friend, me));
        assertThat(friendRepository.findAllFriends(me.getId())).hasSize(1);

        // 친구 삭제는 양방향 행을 모두 soft delete 한다 (FriendService.deleteFriends).
        // 목록 쿼리는 두 방향을 UNION 으로 훑으므로, 한 방향만 지우면 반대편 행 때문에
        // 여전히 친구로 보인다 — 두 UNION 가지 중 하나라도 필터를 빠뜨리면 이 단언이 깨진다.
        forward.delete();
        backward.delete();
        friendRepository.saveAllAndFlush(java.util.List.of(forward, backward));

        assertThat(friendRepository.findAllFriends(me.getId())).isEmpty();
    }

    @Test
    @DisplayName("soft delete 된 관계는 관계 조회에도 잡히지 않는다 — 다시 친구를 맺을 수 있어야 한다")
    void findFriendsRelations_ignoresSoftDeleted() {
        Friend forward = friendRepository.save(Friend.createFriendship(me, friend));
        assertThat(friendRepository.findFriendsRelations(me.getId(), friend.getId())).hasSize(1);

        forward.delete();
        friendRepository.saveAndFlush(forward);

        assertThat(friendRepository.findFriendsRelations(me.getId(), friend.getId())).isEmpty();
    }

    @Test
    @DisplayName("soft delete 된 관계는 상호 친구 판정에서도 빠진다 — 시간표 조회 권한과 직결된다")
    void findMutualFriendIdsAmong_ignoresSoftDeleted() {
        Friend forward = friendRepository.save(Friend.createFriendship(me, friend));
        friendRepository.save(Friend.createFriendship(friend, me));
        assertThat(friendRepository.findMutualFriendIdsAmong(me.getId(), java.util.List.of(friend.getId())))
                .containsExactly(friend.getId());

        forward.delete();
        friendRepository.saveAndFlush(forward);

        assertThat(friendRepository.findMutualFriendIdsAmong(me.getId(), java.util.List.of(friend.getId())))
                .isEmpty();
    }

    private User newUser(String email, String nickname) {
        return User.builder()
                .email(new Email(email))
                .nickname(new Nickname(nickname))
                .name(new UserName(nickname))
                .role(Role.USER)
                .build();
    }
}
