package com.example.highteenday_backend.dtos;

import com.example.highteenday_backend.domain.boards.Board;
import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 익명 글/댓글이 작성자를 식별할 수 있는 값을 응답에 담지 않는지 검증한다.
 * DTO 변환 자체가 안전해야 하며, 별도의 익명화 서비스를 거치는지에 의존해서는 안 된다.
 */
class AnonymityLeakTest {

    private static final String REAL_NICKNAME = "김하이틴";
    private static final String PROFILE_URL = "https://cdn.highteenday.org/profiles/7.png";
    private static final Long AUTHOR_ID = 7L;

    private final User author = User.builder()
            .id(AUTHOR_ID)
            .email(new Email("author@test.com"))
            .nickname(new Nickname(REAL_NICKNAME))
            .name(new UserName("김하이"))
            .profileUrl(PROFILE_URL)
            .build();

    private final Board board = Board.builder().id(1L).name("자유게시판").build();

    @Nested
    @DisplayName("CommentDto.fromEntity")
    class CommentConversion {

        @Test
        @DisplayName("익명 댓글은 실명 닉네임, userId, 프로필 URL을 노출하지 않는다")
        void anonymousCommentHidesIdentity() {
            CommentDto dto = CommentDto.fromEntity(comment(true));

            assertThat(dto.getAuthor()).isEqualTo("익명").isNotEqualTo(REAL_NICKNAME);
            assertThat(dto.getUserId()).isNull();
            assertThat(dto.getProfileUrl()).isNull();
        }

        @Test
        @DisplayName("실명 댓글은 작성자 정보를 그대로 유지한다")
        void namedCommentKeepsIdentity() {
            CommentDto dto = CommentDto.fromEntity(comment(false));

            assertThat(dto.getAuthor()).isEqualTo(REAL_NICKNAME);
            assertThat(dto.getUserId()).isEqualTo(AUTHOR_ID);
            assertThat(dto.getProfileUrl()).isEqualTo(PROFILE_URL);
        }

        private Comment comment(boolean anonymous) {
            Post post = Post.create(author, board, "제목", "본문", true);
            return Comment.builder()
                    .id(50L).user(author).post(post)
                    .content("댓글 내용").isAnonymous(anonymous)
                    .build();
        }
    }

    @Nested
    @DisplayName("PostDto.fromEntity")
    class PostConversion {

        @Test
        @DisplayName("익명 게시글은 실명 닉네임, userId, 프로필 URL을 노출하지 않는다")
        void anonymousPostHidesIdentity() {
            PostDto dto = PostDto.fromEntity(Post.create(author, board, "제목", "본문", true));

            assertThat(dto.getAuthor()).isEqualTo("익명").isNotEqualTo(REAL_NICKNAME);
            assertThat(dto.getUserId()).isNull();
            assertThat(dto.getProfileUrl()).isNull();
        }

        @Test
        @DisplayName("실명 게시글은 작성자 정보를 그대로 유지한다")
        void namedPostKeepsIdentity() {
            PostDto dto = PostDto.fromEntity(Post.create(author, board, "제목", "본문", false));

            assertThat(dto.getAuthor()).isEqualTo(REAL_NICKNAME);
            assertThat(dto.getUserId()).isEqualTo(AUTHOR_ID);
            assertThat(dto.getProfileUrl()).isEqualTo(PROFILE_URL);
        }
    }
}
