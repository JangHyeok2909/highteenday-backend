package com.example.highteenday_backend.domain.posts;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.boards.BoardRepository;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.UserRepository;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import com.example.highteenday_backend.enums.Role;
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

/**
 * 게시글 목록 캐시가 miss를 채울 때 쓰는 프로젝션이 익명 글의 실명을 노출하지 않는지 검증한다.
 */
@DataJpaTest
@Import(QueryDslConfig.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.sql.init.mode=never"
})
class PostPreviewProjectionTest {

    private static final String REAL_NICKNAME = "김하이틴";

    @Autowired private PostRepository postRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private BoardRepository boardRepository;

    private Post anonymousPost;
    private Post namedPost;

    @BeforeEach
    void setUp() {
        Board board = boardRepository.save(Board.builder().name("자유게시판").build());
        User author = userRepository.save(User.builder()
                .email(new Email("author@test.com"))
                .nickname(new Nickname(REAL_NICKNAME))
                .name(new UserName("김하이"))
                .role(Role.USER)
                .build());

        anonymousPost = postRepository.save(Post.create(author, board, "익명 글", "본문", true));
        namedPost = postRepository.save(Post.create(author, board, "실명 글", "본문", false));
    }

    @Test
    @DisplayName("익명 글의 미리보기는 작성자 실명을 담지 않는다")
    void anonymousPreviewHidesRealNickname() {
        PostPreviewDto dto = findPreview(anonymousPost.getId());

        assertThat(dto.getAuthor()).isEqualTo("익명").isNotEqualTo(REAL_NICKNAME);
    }

    @Test
    @DisplayName("실명 글의 미리보기는 작성자 닉네임을 유지한다")
    void namedPreviewKeepsNickname() {
        PostPreviewDto dto = findPreview(namedPost.getId());

        assertThat(dto.getAuthor()).isEqualTo(REAL_NICKNAME);
    }

    @Test
    @DisplayName("프로젝션 결과가 엔티티 변환 결과와 동일한 작성자 표기를 만든다")
    void projectionMatchesEntityConversion() {
        assertThat(findPreview(anonymousPost.getId()).getAuthor())
                .isEqualTo(PostPreviewDto.fromEntity(anonymousPost).getAuthor());
        assertThat(findPreview(namedPost.getId()).getAuthor())
                .isEqualTo(PostPreviewDto.fromEntity(namedPost).getAuthor());
    }

    private PostPreviewDto findPreview(Long postId) {
        List<PostPreviewDto> dtos = postRepository.findAllDtoByIds(List.of(postId));
        assertThat(dtos).hasSize(1);
        return dtos.get(0);
    }
}
