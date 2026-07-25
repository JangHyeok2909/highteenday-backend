package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.boards.BoardRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.posts.PostReactionKind;
import com.example.highteenday_backend.domain.posts.PostRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.CommentDto;
import com.example.highteenday_backend.dtos.LikeStateDto;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.queryDsl.QueryDslConfig;
import com.example.highteenday_backend.services.domain.CommentAnonymizationService;
import com.example.highteenday_backend.services.domain.CommentReactionService;
import jakarta.persistence.EntityManager;
import org.hibernate.Session;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 댓글 목록 응답을 만드는 경로(GET /api/posts/{postId}/comments)가
 * 댓글 수와 무관하게 고정된 개수의 쿼리만 사용하는지 검증한다.
 */
@DataJpaTest
@Import(QueryDslConfig.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.sql.init.mode=never",
        "spring.jpa.properties.hibernate.generate_statistics=true"
})
class CommentListQueryCountTest {

    @Autowired private CommentRepository commentRepository;
    @Autowired private CommentReactionRepository commentReactionRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private BoardRepository boardRepository;
    @Autowired private EntityManager em;

    private CommentReactionService commentReactionService;
    private CommentAnonymizationService anonymizationService;

    private Post post;
    private User viewer;
    private int seq;

    @BeforeEach
    void setUp() {
        commentReactionService = new CommentReactionService(commentReactionRepository);
        anonymizationService = new CommentAnonymizationService();

        Board board = boardRepository.save(Board.builder().name("자유게시판").build());
        User author = userRepository.save(newUser("author@test.com", "author"));
        viewer = userRepository.save(newUser("viewer@test.com", "viewer"));
        post = postRepository.save(Post.create(author, board, "title", "content", true));
    }

    @Test
    @DisplayName("댓글 목록 조회는 댓글 수가 늘어도 쿼리 수가 늘지 않는다")
    void commentListQueryCountIsConstant() {
        long queriesFor3 = renderCommentList(seedComments(3));
        long queriesFor30 = renderCommentList(seedComments(30));

        assertThat(queriesFor30).isEqualTo(queriesFor3);
    }

    @Test
    @DisplayName("댓글 목록 조회는 목록 1회 + 반응 1회, 총 2번의 쿼리만 실행한다")
    void commentListUsesTwoQueries() {
        seedComments(20);

        assertThat(renderCommentList(20)).isEqualTo(2);
    }

    @Test
    @DisplayName("배치 조회한 반응 상태가 개별 조회 결과와 일치한다")
    void batchLikeStatesMatchPerCommentLookup() {
        seedComments(6);

        List<Comment> comments = commentRepository.findByPost(post);
        Map<Long, LikeStateDto> states = commentReactionService.getLikeStates(comments, viewer);

        assertThat(states).hasSameSizeAs(comments);
        for (Comment comment : comments) {
            LikeStateDto expected = commentReactionService.getLikeSatateDto(comment, viewer);
            LikeStateDto actual = states.get(comment.getId());

            assertThat(actual.isLiked()).isEqualTo(expected.isLiked());
            assertThat(actual.isDisliked()).isEqualTo(expected.isDisliked());
            assertThat(actual.getLikeCount()).isEqualTo(expected.getLikeCount());
            assertThat(actual.getDislikeCount()).isEqualTo(expected.getDislikeCount());
        }
    }

    /** 컨트롤러의 목록 렌더링 흐름을 그대로 재현하고 실행된 쿼리 수를 돌려준다. */
    private long renderCommentList(int expectedSize) {
        em.flush();
        em.clear();

        Statistics statistics = em.unwrap(Session.class).getSessionFactory().getStatistics();
        statistics.clear();

        List<Comment> comments = commentRepository.findByPost(post);
        List<CommentDto> dtos = anonymizationService.anonymize(post, comments);
        Map<Long, LikeStateDto> likeStates = commentReactionService.getLikeStates(comments, viewer);
        for (int i = 0; i < comments.size(); i++) {
            LikeStateDto likeState = likeStates.get(comments.get(i).getId());
            dtos.get(i).setLiked(likeState.isLiked());
            dtos.get(i).setDisliked(likeState.isDisliked());
        }

        assertThat(comments).hasSize(expectedSize);
        return statistics.getPrepareStatementCount();
    }

    /** 댓글 n개를 작성자 전원 다르게 만들고 절반에는 좋아요를 남긴다. 총 댓글 수를 돌려준다. */
    private int seedComments(int count) {
        List<Comment> created = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            User commenter = userRepository.save(newUser("commenter" + (seq++) + "@test.com", "nick" + seq));
            created.add(commentRepository.save(Comment.create(commenter, post, "content" + i, true, null)));
        }
        for (int i = 0; i < created.size(); i += 2) {
            commentReactionRepository.save(CommentReaction.builder()
                    .comment(created.get(i))
                    .user(viewer)
                    .kind(PostReactionKind.LIKE)
                    .build());
        }
        return (int) commentRepository.findByPost(post).stream().count();
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
