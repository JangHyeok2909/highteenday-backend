package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.dtos.CommentDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CommentAnonymizationServiceTest {

    private CommentAnonymizationService service;

    private User postAuthor;
    private User otherUser1;
    private User otherUser2;
    private Post anonymousPost;
    private Post nonAnonymousPost;

    @BeforeEach
    void setUp() {
        service = new CommentAnonymizationService();

        postAuthor = User.builder().id(1L).nickname(new Nickname("글쓴이닉")).build();
        otherUser1 = User.builder().id(2L).nickname(new Nickname("유저1닉")).build();
        otherUser2 = User.builder().id(3L).nickname(new Nickname("유저2닉")).build();

        anonymousPost = Post.builder()
                .id(10L).user(postAuthor).isAnonymous(true).title("익명 게시글")
                .build();
        nonAnonymousPost = Post.builder()
                .id(20L).user(postAuthor).isAnonymous(false).title("공개 게시글")
                .build();
    }

    private Comment anonComment(long id, User author, Post post) {
        return Comment.builder()
                .id(id).user(author).post(post)
                .isAnonymous(true).content("내용").likeCount(0).dislikeCount(0)
                .build();
    }

    private Comment publicComment(long id, User author, Post post) {
        return Comment.builder()
                .id(id).user(author).post(post)
                .isAnonymous(false).content("내용").likeCount(0).dislikeCount(0)
                .build();
    }

    @Nested
    @DisplayName("비익명 게시글")
    class NonAnonymousPost {

        @Test
        @DisplayName("모든 댓글의 닉네임과 userId가 그대로 유지된다")
        void keepsRealNicknames() {
            List<Comment> comments = List.of(
                    anonComment(1L, otherUser1, nonAnonymousPost),
                    publicComment(2L, otherUser2, nonAnonymousPost)
            );

            List<CommentDto> dtos = service.anonymize(nonAnonymousPost, comments);

            assertThat(dtos).hasSize(2);
            // 첫 번째 댓글은 isAnonymous=true이지만 게시글이 비익명이므로 anonMap엔 글쓴이 예약 없음
            // 익명 댓글 → 아직 글쓴이(postAuthor)가 아니므로 "익명1" 할당
            assertThat(dtos.get(0).getAuthor()).isEqualTo("익명1");
            assertThat(dtos.get(0).getUserId()).isNull();
            // 두 번째 댓글은 비익명 → 실제 닉네임 유지
            assertThat(dtos.get(1).getAuthor()).isEqualTo("유저2닉");
            assertThat(dtos.get(1).getUserId()).isEqualTo(3L);
        }
    }

    @Nested
    @DisplayName("익명 게시글")
    class AnonymousPost {

        @Test
        @DisplayName("빈 댓글 목록이면 빈 리스트를 반환한다")
        void emptyComments() {
            List<CommentDto> dtos = service.anonymize(anonymousPost, List.of());
            assertThat(dtos).isEmpty();
        }

        @Test
        @DisplayName("글쓴이의 익명 댓글은 '익명(글쓴이)'이고 userId는 null이다")
        void postAuthorCommentLabeledAsWriter() {
            List<Comment> comments = List.of(anonComment(1L, postAuthor, anonymousPost));

            List<CommentDto> dtos = service.anonymize(anonymousPost, comments);

            assertThat(dtos.get(0).getAuthor()).isEqualTo("익명(글쓴이)");
            assertThat(dtos.get(0).getUserId()).isNull();
        }

        @Test
        @DisplayName("다른 유저의 익명 댓글은 '익명2'부터 순서대로 부여된다")
        void otherUsersGetSequentialNumbers() {
            List<Comment> comments = List.of(
                    anonComment(1L, otherUser1, anonymousPost),
                    anonComment(2L, otherUser2, anonymousPost)
            );

            List<CommentDto> dtos = service.anonymize(anonymousPost, comments);

            assertThat(dtos.get(0).getAuthor()).isEqualTo("익명2");
            assertThat(dtos.get(1).getAuthor()).isEqualTo("익명3");
            assertThat(dtos.get(0).getUserId()).isNull();
            assertThat(dtos.get(1).getUserId()).isNull();
        }

        @Test
        @DisplayName("같은 유저의 여러 익명 댓글은 동일한 번호를 유지한다")
        void sameUserGetsSameNumber() {
            List<Comment> comments = List.of(
                    anonComment(1L, otherUser1, anonymousPost),
                    anonComment(2L, otherUser1, anonymousPost),
                    anonComment(3L, otherUser1, anonymousPost)
            );

            List<CommentDto> dtos = service.anonymize(anonymousPost, comments);

            assertThat(dtos).extracting(CommentDto::getAuthor)
                    .containsExactly("익명2", "익명2", "익명2");
        }

        @Test
        @DisplayName("글쓴이·다른유저·같은유저 혼합 시 번호가 올바르게 부여된다")
        void mixedCommentersCorrectNumbering() {
            List<Comment> comments = List.of(
                    anonComment(1L, postAuthor, anonymousPost),  // 글쓴이
                    anonComment(2L, otherUser1, anonymousPost),  // 익명2
                    anonComment(3L, postAuthor, anonymousPost),  // 글쓴이 (재등장)
                    anonComment(4L, otherUser2, anonymousPost),  // 익명3
                    anonComment(5L, otherUser1, anonymousPost)   // 익명2 (재등장)
            );

            List<CommentDto> dtos = service.anonymize(anonymousPost, comments);

            assertThat(dtos).extracting(CommentDto::getAuthor)
                    .containsExactly("익명(글쓴이)", "익명2", "익명(글쓴이)", "익명3", "익명2");
        }

        @Test
        @DisplayName("비익명 댓글은 실제 닉네임과 userId가 유지된다")
        void publicCommentInAnonymousPostKeepsNickname() {
            List<Comment> comments = List.of(publicComment(1L, otherUser1, anonymousPost));

            List<CommentDto> dtos = service.anonymize(anonymousPost, comments);

            assertThat(dtos.get(0).getAuthor()).isEqualTo("유저1닉");
            assertThat(dtos.get(0).getUserId()).isEqualTo(2L);
        }

        @Test
        @DisplayName("익명·비익명 댓글이 혼재해도 각각 올바르게 처리된다")
        void mixedAnonymityHandledCorrectly() {
            List<Comment> comments = List.of(
                    anonComment(1L, otherUser1, anonymousPost),
                    publicComment(2L, otherUser2, anonymousPost),
                    anonComment(3L, postAuthor, anonymousPost)
            );

            List<CommentDto> dtos = service.anonymize(anonymousPost, comments);

            assertThat(dtos.get(0).getAuthor()).isEqualTo("익명2");
            assertThat(dtos.get(0).getUserId()).isNull();

            assertThat(dtos.get(1).getAuthor()).isEqualTo("유저2닉");
            assertThat(dtos.get(1).getUserId()).isEqualTo(3L);

            assertThat(dtos.get(2).getAuthor()).isEqualTo("익명(글쓴이)");
            assertThat(dtos.get(2).getUserId()).isNull();
        }
    }
}
