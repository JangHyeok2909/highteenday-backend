package com.example.highteenday_backend.domain.scraps;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.boards.BoardRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.PostPreviewDto;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 마이페이지 스크랩 목록이 DB에서 페이지 단위로 잘라 오는지 검증한다.
 * 이전 구현은 사용자의 전체 스크랩을 메모리에 올린 뒤 자바에서 잘라 냈다.
 */
@DataJpaTest
@Import(QueryDslConfig.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.sql.init.mode=never",
        "spring.jpa.properties.hibernate.generate_statistics=true"
})
class ScrappedPostPagingTest {

    private static final int PAGE_SIZE = 10;

    @Autowired private ScrapRepository scrapRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private BoardRepository boardRepository;
    @Autowired private EntityManager em;

    private User me;
    private Board board;
    private User author;
    private final List<Post> scrappedInOrder = new ArrayList<>();

    @BeforeEach
    void setUp() {
        board = boardRepository.save(Board.builder().name("자유게시판").build());
        me = userRepository.save(newUser("me@test.com", "me"));
        author = userRepository.save(newUser("author@test.com", "글쓴이"));
    }

    @Test
    @DisplayName("스크랩이 많아도 요청한 페이지 크기만큼만 반환한다")
    void returnsOnlyRequestedPage() {
        scrap(35);

        Page<PostPreviewDto> page = scrapRepository.findScrappedPostPreviews(me, PageRequest.of(0, PAGE_SIZE));

        assertThat(page.getContent()).hasSize(PAGE_SIZE);
        assertThat(page.getTotalElements()).isEqualTo(35);
        assertThat(page.getTotalPages()).isEqualTo(4);
    }

    @Test
    @DisplayName("최근 스크랩 순으로 정렬된다")
    void ordersByMostRecentlyScrapped() {
        scrap(3);

        List<PostPreviewDto> content = scrapRepository
                .findScrappedPostPreviews(me, PageRequest.of(0, PAGE_SIZE)).getContent();

        List<Long> expected = new ArrayList<>(scrappedInOrder.stream().map(Post::getId).toList());
        Collections.reverse(expected);
        assertThat(content).extracting(PostPreviewDto::getId).containsExactlyElementsOf(expected);
    }

    @Test
    @DisplayName("스크랩 수가 늘어도 쿼리 수는 늘지 않는다 (목록 1회 + 카운트 1회)")
    void queryCountIsConstant() {
        // 둘 다 여러 페이지가 되도록 잡는다. 결과가 한 페이지에 들어가면
        // Spring Data가 카운트 쿼리를 생략해 비교 대상이 달라진다.
        scrap(15);
        long queriesFor15 = countQueries();

        scrap(40);
        long queriesFor55 = countQueries();

        assertThat(queriesFor15).isEqualTo(2);
        assertThat(queriesFor55).isEqualTo(queriesFor15);
    }

    @Test
    @DisplayName("범위를 벗어난 페이지는 예외 없이 빈 목록을 반환한다")
    void outOfRangePageIsEmpty() {
        scrap(3);

        Page<PostPreviewDto> page = scrapRepository.findScrappedPostPreviews(me, PageRequest.of(99, PAGE_SIZE));

        assertThat(page.getContent()).isEmpty();
        assertThat(page.getTotalElements()).isEqualTo(3);
    }

    @Test
    @DisplayName("취소된 스크랩과 삭제된 게시글은 제외된다")
    void excludesCancelledScrapsAndDeletedPosts() {
        scrap(3);
        scrapRepository.findAll().get(0).cancelScrap();
        scrappedInOrder.get(1).delete();
        em.flush();

        Page<PostPreviewDto> page = scrapRepository.findScrappedPostPreviews(me, PageRequest.of(0, PAGE_SIZE));

        assertThat(page.getTotalElements()).isEqualTo(1);
    }

    @Test
    @DisplayName("익명 게시글은 작성자 실명을 노출하지 않는다")
    void anonymousPostHidesRealNickname() {
        scrap(1);

        PostPreviewDto dto = scrapRepository
                .findScrappedPostPreviews(me, PageRequest.of(0, PAGE_SIZE)).getContent().get(0);

        assertThat(dto.getAuthor()).isEqualTo("익명").isNotEqualTo("글쓴이");
    }

    private long countQueries() {
        em.flush();
        em.clear();
        Statistics statistics = em.unwrap(Session.class).getSessionFactory().getStatistics();
        statistics.clear();

        scrapRepository.findScrappedPostPreviews(me, PageRequest.of(0, PAGE_SIZE)).getContent();
        return statistics.getPrepareStatementCount();
    }

    private void scrap(int count) {
        for (int i = 0; i < count; i++) {
            Post post = postRepository.save(
                    Post.create(author, board, "제목" + scrappedInOrder.size(), "본문", true));
            scrapRepository.save(Scrap.builder().post(post).user(me).build());
            scrappedInOrder.add(post);
        }
        em.flush();
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
