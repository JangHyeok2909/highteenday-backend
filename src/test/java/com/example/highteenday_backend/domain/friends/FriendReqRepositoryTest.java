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

import java.util.List;

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
class FriendReqRepositoryTest {

    @Autowired
    private FriendReqRepository friendReqRepository;
    @Autowired
    private UserRepository userRepository;

    private User requester;
    private User receiver;

    @BeforeEach
    void setUp() {
        requester = userRepository.save(newUser("requester@test.com", "req"));
        receiver = userRepository.save(newUser("receiver@test.com", "rec"));
    }

    @Test
    @DisplayName("활성 친구 요청은 모든 조회 경로에서 반환된다")
    void findsActiveRequest() {
        FriendReq request = friendReqRepository.saveAndFlush(FriendReq.create(requester, receiver));

        assertThat(friendReqRepository.findActiveById(request.getId())).contains(request);
        assertThat(friendReqRepository.findBetween(requester.getId(), receiver.getId())).containsExactly(request);
        assertThat(friendReqRepository.findSentFriendsRequest(requester.getId())).containsExactly(request);
        assertThat(friendReqRepository.findReceivedFriendRequestsByReceiverId(receiver.getId())).containsExactly(request);
        assertThat(friendReqRepository.findRequestedIdsAmong(requester.getId(), List.of(receiver.getId())))
                .containsExactly(receiver.getId());
        assertThat(friendReqRepository.findRequesterIdsAmong(receiver.getId(), List.of(requester.getId())))
                .containsExactly(requester.getId());
    }

    @Test
    @DisplayName("소프트 삭제된 친구 요청은 모든 조회 경로에서 제외된다")
    void excludesSoftDeletedRequest() {
        FriendReq request = friendReqRepository.saveAndFlush(FriendReq.create(requester, receiver));
        request.delete();
        friendReqRepository.flush();

        assertThat(friendReqRepository.findActiveById(request.getId())).isEmpty();
        assertThat(friendReqRepository.findBetween(requester.getId(), receiver.getId())).isEmpty();
        assertThat(friendReqRepository.findSentFriendsRequest(requester.getId())).isEmpty();
        assertThat(friendReqRepository.findReceivedFriendRequestsByReceiverId(receiver.getId())).isEmpty();
        assertThat(friendReqRepository.findRequestedIdsAmong(requester.getId(), List.of(receiver.getId()))).isEmpty();
        assertThat(friendReqRepository.findRequesterIdsAmong(receiver.getId(), List.of(requester.getId()))).isEmpty();
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
