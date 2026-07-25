package com.example.highteenday_backend.domain.friends;

import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.enums.Role;
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
@Import(QueryDslConfig.class)
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

    private User newUser(String email, String nickname) {
        return User.builder()
                .email(new Email(email))
                .nickname(new Nickname(nickname))
                .name(new UserName(nickname))
                .role(Role.USER)
                .build();
    }
}
