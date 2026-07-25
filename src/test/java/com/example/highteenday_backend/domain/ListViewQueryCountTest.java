package com.example.highteenday_backend.domain;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.boards.BoardRepository;
import com.example.highteenday_backend.domain.notification.Notification;
import com.example.highteenday_backend.domain.notification.NotificationRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.NotificationDto;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.enums.NotificationCategory;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.queryDsl.QueryDslConfig;
import jakarta.persistence.EntityManager;
import org.hibernate.Session;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.TestPropertySource;

import java.util.List;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 페이징된 목록 조회가 행 수와 무관하게 고정된 쿼리만 사용하는지 검증한다.
 * DTO 변환에서 지연 로딩이 일어나면 페이지 크기만큼 쿼리가 늘어난다.
 */
@DataJpaTest
@Import(QueryDslConfig.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.sql.init.mode=never",
        "spring.jpa.properties.hibernate.generate_statistics=true"
})
class ListViewQueryCountTest {

    private static final int PAGE_SIZE = 10;

    @Autowired private PostRepository postRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private BoardRepository boardRepository;
    @Autowired private EntityManager em;

    private User me;
    private int seq;

    @BeforeEach
    void setUp() {
        me = userRepository.save(newUser("me@test.com", "me"));
    }

    @Test
    @DisplayName("내가 쓴 글 목록은 게시판마다 추가 조회를 하지 않는다")
    void myPostListDoesNotLazyLoadBoards() {
        // PostPreviewDto는 게시판에서 id만 읽으므로 프록시가 초기화되지 않는다.
        // 이후 이름 같은 다른 필드를 참조하게 되면 이 테스트가 깨진다.
        for (int i = 0; i < 25; i++) {
            Board board = boardRepository.save(Board.builder().name("게시판" + i).build());
            postRepository.save(Post.create(me, board, "제목" + i, "본문", true));
        }

        long queries = countQueries(() -> postRepository
                .findByUser(me, PageRequest.of(0, PAGE_SIZE, Sort.by(Sort.Direction.DESC, "id")))
                .getContent()
                .forEach(PostPreviewDto::fromEntity));

        assertThat(queries).isEqualTo(2);
    }

    @Test
    @DisplayName("알림 목록은 발신자마다 추가 조회를 하지 않는다")
    void notificationListDoesNotLazyLoadSenders() {
        for (int i = 0; i < 25; i++) {
            User sender = userRepository.save(newUser("sender" + i + "@test.com", "보낸이" + i));
            notificationRepository.save(notification(sender));
        }

        long queries = countQueries(() -> notificationRepository
                .findPageByReceiver(me, PageRequest.of(0, PAGE_SIZE))
                .getContent()
                .forEach(NotificationDto::fromEntity));

        assertThat(queries).isEqualTo(2);
    }

    @Test
    @DisplayName("발신자가 없는 시스템 알림도 목록에 포함된다")
    void systemNotificationsWithoutSenderAreIncluded() {
        notificationRepository.save(notification(null));
        notificationRepository.save(notification(userRepository.save(newUser("s@test.com", "보낸이"))));

        List<Notification> content = notificationRepository
                .findPageByReceiver(me, PageRequest.of(0, PAGE_SIZE)).getContent();

        assertThat(content).hasSize(2);
        assertThat(content).anyMatch(n -> n.getSender() == null);
    }

    private long countQueries(Runnable work) {
        em.flush();
        em.clear();
        Statistics statistics = em.unwrap(Session.class).getSessionFactory().getStatistics();
        statistics.clear();

        work.run();
        return statistics.getPrepareStatementCount();
    }

    private Notification notification(User sender) {
        return Notification.builder()
                .receiver(me)
                .sender(sender)
                .category(NotificationCategory.values()[0])
                .message("알림 " + (seq++))
                .build();
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
