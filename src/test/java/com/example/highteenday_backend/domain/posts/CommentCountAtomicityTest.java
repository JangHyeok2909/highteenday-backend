package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.boards.BoardRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.queryDsl.QueryDslConfig;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 댓글 수 증감이 DB에서 직접 계산되는지 검증한다.
 *
 * <p>엔티티에서 값을 읽어 ±1 한 뒤 쓰면 동시 작성/삭제에서 갱신이 유실된다.
 * UPDATE 문이 컬럼 자신을 참조해야만 한 문장 안에서 원자적으로 처리된다.
 */
@DataJpaTest
@Import(QueryDslConfig.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.sql.init.mode=never"
})
class CommentCountAtomicityTest {

    @Autowired private PostRepository postRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private BoardRepository boardRepository;
    @Autowired private EntityManager em;

    private Post post;

    @BeforeEach
    void setUp() {
        Board board = boardRepository.save(Board.builder().name("자유게시판").build());
        User author = userRepository.save(User.builder()
                .email(new Email("author@test.com"))
                .nickname(new Nickname("author"))
                .name(new UserName("author"))
                .role(Role.USER)
                .build());
        post = postRepository.save(Post.create(author, board, "제목", "본문", true));
    }

    @Test
    @DisplayName("증가 문을 여러 번 실행하면 실행 횟수만큼 누적된다")
    void incrementAccumulates() {
        for (int i = 0; i < 5; i++) {
            postRepository.incrementCommentCount(post.getId());
        }

        assertThat(reloadCommentCount()).isEqualTo(5);
    }

    @Test
    @DisplayName("감소 문은 0 미만으로 내려가지 않는다")
    void decrementFloorsAtZero() {
        postRepository.incrementCommentCount(post.getId());
        for (int i = 0; i < 3; i++) {
            postRepository.decrementCommentCount(post.getId());
        }

        assertThat(reloadCommentCount()).isZero();
    }

    @Test
    @DisplayName("증가/감소 UPDATE는 컬럼 자신을 읽어 계산한다")
    void updateStatementsAreSelfReferential() throws NoSuchMethodException {
        assertSelfReferential(PostRepository.class.getMethod("incrementCommentCount", Long.class));
        assertSelfReferential(PostRepository.class.getMethod("decrementCommentCount", Long.class));
    }

    private void assertSelfReferential(Method method) {
        String jpql = method.getAnnotation(org.springframework.data.jpa.repository.Query.class)
                .value().replaceAll("\\s+", " ");

        assertThat(jpql)
                .as("%s 가 엔티티에서 읽은 값을 대입하면 동시 요청에서 갱신이 유실된다", method.getName())
                .contains("p.commentCount")
                .containsPattern("p\\.commentCount\\s*=.*p\\.commentCount");
    }

    /** 벌크 UPDATE는 영속성 컨텍스트를 갱신하지 않으므로 DB에서 다시 읽는다. */
    private int reloadCommentCount() {
        em.clear();
        return postRepository.findById(post.getId()).orElseThrow().getCommentCount();
    }
}
