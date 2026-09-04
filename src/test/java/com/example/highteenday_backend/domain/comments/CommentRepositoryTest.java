package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.configs.JpaAuditingConfig;
import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.queryDsl.QueryDslConfig;
import jakarta.persistence.EntityManager;
import org.hibernate.Hibernate;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 댓글 목록 조회가 작성자를 함께 읽는지 확인한다 (OPT-002).
 *
 * 지키려는 것은 결과값이 아니라 **쿼리 수**다. `Comment.user` 는 LAZY 라
 * fetch join 이 빠져도 결과는 똑같이 나오고 테스트도 전부 통과한다 — 다만 작성자
 * 수만큼 SELECT 가 더 나갈 뿐이다. 그래서 여기서는 Hibernate 통계로 실제 실행된
 * 쿼리 수를 센다.
 */
@DataJpaTest
// JpaAuditingConfig 가 없으면 BaseEntity.created 가 null 이라 NOT NULL 제약에 걸린다(KI-52).
@Import({QueryDslConfig.class, JpaAuditingConfig.class})
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.sql.init.mode=never",
        // 쿼리 수를 세려면 통계 수집을 켜야 한다. 운영 설정에는 켜지 않는다.
        "spring.jpa.properties.hibernate.generate_statistics=true"
})
class CommentRepositoryTest {

    @Autowired
    private CommentRepository commentRepository;

    @Autowired
    private EntityManager em;

    private Post post;
    private Statistics statistics;

    @BeforeEach
    void setUp() {
        Board board = em.merge(Board.builder().name("자유게시판").build());
        User postAuthor = persistUser("author@test.com", "글쓴이");
        post = em.merge(Post.create(postAuthor, board, "제목", "내용", false));

        // 댓글 3건을 **서로 다른 작성자** 3명이 달았다. N+1 이 살아 있으면
        // 작성자 수만큼(=3) 추가 SELECT 가 나간다.
        for (int i = 1; i <= 3; i++) {
            User commenter = persistUser("user" + i + "@test.com", "댓글러" + i);
            em.persist(Comment.create(commenter, post, "댓글" + i, false, null));
        }

        // 영속성 컨텍스트를 비우지 않으면 위에서 저장한 User 들이 1차 캐시에 남아
        // fetch join 이 없어도 추가 쿼리가 나가지 않는다 — 그 상태의 테스트는
        // 아무것도 검증하지 못한다.
        em.flush();
        em.clear();

        statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
    }

    private User persistUser(String email, String nickname) {
        User user = User.createOAuth(new Email(email), new UserName("테스트"),
                new Nickname(nickname), com.example.highteenday_backend.enums.Provider.GOOGLE, null);
        em.persist(user);
        return user;
    }

    @Nested
    @DisplayName("findByPost")
    class FindByPost {

        @Test
        @DisplayName("작성자를 함께 읽어 온다")
        void fetchesAuthorEagerly() {
            List<Comment> comments = commentRepository.findByPost(post);

            assertThat(comments).hasSize(3);
            assertThat(comments).allSatisfy(comment ->
                    assertThat(Hibernate.isInitialized(comment.getUser())).isTrue());
        }

        @Test
        @DisplayName("작성자 닉네임을 전부 읽어도 쿼리는 1개다")
        void readsAllAuthorsWithoutExtraQuery() {
            List<Comment> comments = commentRepository.findByPost(post);
            comments.forEach(comment -> comment.getUser().getNicknameValue());

            // fetch join 이 빠지면 이 값이 1 + (서로 다른 작성자 수) = 4 가 된다.
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("삭제된 댓글은 제외한다")
        void excludesDeletedComments() {
            Comment deleted = commentRepository.findByPost(post).get(0);
            deleted.delete();
            em.flush();
            em.clear();

            assertThat(commentRepository.findByPost(post)).hasSize(2);
        }
    }
}
