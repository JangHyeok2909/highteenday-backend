package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.comments.Comment;
import com.example.highteenday_backend.domain.comments.CommentRepository;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.domain.users.User;
import com.example.highteenday_backend.domain.users.vo.Email;
import com.example.highteenday_backend.domain.users.vo.Nickname;
import com.example.highteenday_backend.domain.users.vo.UserName;
import com.example.highteenday_backend.dtos.RequestCommentDto;
import com.example.highteenday_backend.enums.Role;
import com.example.highteenday_backend.enums.SortType;
import com.example.highteenday_backend.eventEntities.events.CommentCreatedEvent;
import com.example.highteenday_backend.exceptions.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CommentServiceTest {

    @Mock private CommentRepository commentRepository;
    @Mock private MediaProcessingService mediaProcessingService;
    @Mock private ApplicationEventPublisher eventPublisher;

    @InjectMocks private CommentService commentService;

    private User author;
    private User postAuthor;
    private Post post;

    @BeforeEach
    void setUp() {
        author = user(1L, "writer");
        postAuthor = user(2L, "poster");
        post = Post.builder()
                .id(100L)
                .user(postAuthor)
                .title("제목")
                .content("본문")
                .commentCount(0)
                .build();

        when(commentRepository.save(any(Comment.class))).thenAnswer(inv -> {
            Comment c = inv.getArgument(0);
            if (c.getId() == null) ReflectionTestUtils.setField(c, "id", 500L);
            return c;
        });
    }

    private static User user(Long id, String nickname) {
        return User.builder()
                .id(id)
                .email(new Email("user" + id + "@test.com"))
                .name(new UserName("이름" + id))
                .nickname(new Nickname(nickname))
                .role(Role.USER)
                .build();
    }

    private static RequestCommentDto dto(String content, Long parentId, String url) {
        return RequestCommentDto.builder()
                .content(content)
                .parentId(parentId)
                .url(url)
                .isAnonymous(true)
                .build();
    }

    @Nested
    @DisplayName("findCommentById")
    class FindCommentById {

        @Test
        @DisplayName("없으면 ResourceNotFoundException — 메시지에 id가 담긴다")
        void throwsWhenMissing() {
            when(commentRepository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> commentService.findCommentById(99L))
                    .isInstanceOf(ResourceNotFoundException.class)
                    .hasMessageContaining("99");
        }
    }

    @Nested
    @DisplayName("createComment")
    class CreateComment {

        @Test
        @DisplayName("댓글을 저장하고 게시글 댓글 수를 올린다")
        void savesCommentAndIncrementsCount() {
            Comment result = commentService.createComment(post, author, dto("좋아요", null, null));

            assertThat(result.getContent()).isEqualTo("좋아요");
            assertThat(result.getUser()).isSameAs(author);
            assertThat(result.getPost()).isSameAs(post);
            assertThat(result.isAnonymous()).isTrue();
            assertThat(post.getCommentCount()).isEqualTo(1);
            verify(commentRepository).save(any(Comment.class));
        }

        @Test
        @DisplayName("parentId가 있으면 대댓글로 부모를 연결한다")
        void assignsParentForReply() {
            Comment parent = Comment.create(postAuthor, post, "부모 댓글", false, null);
            ReflectionTestUtils.setField(parent, "id", 300L);
            when(commentRepository.findById(300L)).thenReturn(Optional.of(parent));

            Comment result = commentService.createComment(post, author, dto("답글", 300L, null));

            assertThat(result.getParent()).isSameAs(parent);
        }

        @Test
        @DisplayName("parentId가 가리키는 댓글이 없으면 ResourceNotFoundException — 저장하지 않는다")
        void throwsWhenParentMissing() {
            when(commentRepository.findById(300L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> commentService.createComment(post, author, dto("답글", 300L, null)))
                    .isInstanceOf(ResourceNotFoundException.class);

            verify(commentRepository, never()).save(any());
            assertThat(post.getCommentCount()).isZero();
        }

        @Test
        @DisplayName("url이 있으면 미디어 처리를 호출한다")
        void processesMediaWhenUrlPresent() {
            RequestCommentDto request = dto("사진 댓글", null, "https://s3/tmp/a.png");

            commentService.createComment(post, author, request);

            verify(mediaProcessingService).processCreateCommentMedia(
                    org.mockito.ArgumentMatchers.eq(1L), any(Comment.class),
                    org.mockito.ArgumentMatchers.eq(request));
        }

        @Test
        @DisplayName("url이 null이거나 비어 있으면 미디어 처리를 건너뛴다")
        void skipsMediaWhenUrlAbsent() {
            commentService.createComment(post, author, dto("글만", null, null));
            commentService.createComment(post, author, dto("글만", null, ""));

            verify(mediaProcessingService, never())
                    .processCreateCommentMedia(anyLong(), any(), any());
        }

        @Test
        @DisplayName("CommentCreatedEvent를 발행하고 작성자·게시글 작성자 id를 담는다")
        void publishesEvent() {
            commentService.createComment(post, author, dto("좋아요", null, null));

            ArgumentCaptor<CommentCreatedEvent> captor =
                    ArgumentCaptor.forClass(CommentCreatedEvent.class);
            verify(eventPublisher).publishEvent(captor.capture());
            CommentCreatedEvent event = captor.getValue();

            assertThat(event.getCommentId()).isEqualTo(500L);
            assertThat(event.getPostId()).isEqualTo(100L);
            assertThat(event.getAuthorId()).isEqualTo(1L);
            assertThat(event.getPostAuthorId()).isEqualTo(2L);
            assertThat(event.getContent()).isEqualTo("좋아요");
        }

        @Test
        @DisplayName("일반 댓글이면 parentCommentAuthorId는 null")
        void leavesParentFieldNullForTopLevelComment() {
            commentService.createComment(post, author, dto("좋아요", null, null));

            ArgumentCaptor<CommentCreatedEvent> captor =
                    ArgumentCaptor.forClass(CommentCreatedEvent.class);
            verify(eventPublisher).publishEvent(captor.capture());
            assertThat(captor.getValue().getParentCommentAuthorId()).isNull();
        }

        @Test
        @DisplayName("대댓글이면 parentCommentAuthorId에 부모 댓글 '작성자' id가 담긴다")
        void carriesParentAuthorId() {
            // 부모 댓글의 id(300)가 아니라 그 작성자의 id(2)여야 한다. 필드 이름과 값이 일치해야
            // 리스너가 대댓글 알림을 보낼 대상을 제대로 고를 수 있다.
            Comment parent = Comment.create(postAuthor, post, "부모 댓글", false, null);
            ReflectionTestUtils.setField(parent, "id", 300L);
            when(commentRepository.findById(300L)).thenReturn(Optional.of(parent));

            commentService.createComment(post, author, dto("답글", 300L, null));

            ArgumentCaptor<CommentCreatedEvent> captor =
                    ArgumentCaptor.forClass(CommentCreatedEvent.class);
            verify(eventPublisher).publishEvent(captor.capture());
            assertThat(captor.getValue().getParentCommentAuthorId()).isEqualTo(2L);
            assertThat(captor.getValue().getParentCommentAuthorId())
                    .isNotEqualTo(parent.getId());
        }

        @Test
        @DisplayName("저장 직후 updatedBy를 비운다 — 생성은 수정이 아니다")
        void clearsUpdatedBy() {
            Comment result = commentService.createComment(post, author, dto("좋아요", null, null));

            assertThat(result.getUpdatedBy()).isNull();
        }
    }

    @Nested
    @DisplayName("updateComment")
    class UpdateComment {

        @Test
        @DisplayName("내용을 바꾸고 updatedBy를 기록하고 미디어를 재처리한다")
        void updatesContent() {
            Comment comment = Comment.create(author, post, "원래 내용", true, null);
            ReflectionTestUtils.setField(comment, "id", 500L);
            when(commentRepository.findById(500L)).thenReturn(Optional.of(comment));
            RequestCommentDto request = dto("바뀐 내용", null, null);

            commentService.updateComment(500L, 1L, request);

            assertThat(comment.getContent()).isEqualTo("바뀐 내용");
            assertThat(comment.getUpdatedBy()).isEqualTo(1L);
            verify(mediaProcessingService).processUpdateCommentMedia(comment, request);
        }

        @Test
        @DisplayName("없는 댓글이면 ResourceNotFoundException")
        void throwsWhenMissing() {
            when(commentRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> commentService.updateComment(999L, 1L, dto("x", null, null)))
                    .isInstanceOf(ResourceNotFoundException.class);

            verify(mediaProcessingService, never()).processUpdateCommentMedia(any(), any());
        }

        @Test
        @DisplayName("작성자 확인을 하지 않는다 — 소유권 검증은 컨트롤러 책임이다")
        void doesNotVerifyOwnership() {
            // 서비스는 userId를 updatedBy 기록에만 쓴다. 남의 댓글도 수정된다.
            // 컨트롤러에서 소유권을 막고 있다는 전제를 고정해 둔다.
            Comment comment = Comment.create(author, post, "원래 내용", true, null);
            ReflectionTestUtils.setField(comment, "id", 500L);
            when(commentRepository.findById(500L)).thenReturn(Optional.of(comment));

            commentService.updateComment(500L, 999L, dto("남이 바꿈", null, null));

            assertThat(comment.getContent()).isEqualTo("남이 바꿈");
            assertThat(comment.getUpdatedBy()).isEqualTo(999L);
        }
    }

    @Nested
    @DisplayName("deleteComment")
    class DeleteComment {

        @Test
        @DisplayName("soft delete하고 게시글 댓글 수를 내린다")
        void softDeletesAndDecrementsCount() {
            Comment comment = Comment.create(author, post, "내용", true, null);
            ReflectionTestUtils.setField(comment, "id", 500L);
            post.incrementCommentCount();
            when(commentRepository.findById(500L)).thenReturn(Optional.of(comment));

            commentService.deleteComment(500L, 1L);

            assertThat(comment.getIsValid()).isFalse();
            assertThat(comment.getUpdatedBy()).isEqualTo(1L);
            assertThat(post.getCommentCount()).isZero();
        }

        @Test
        @DisplayName("댓글 수가 0이면 더 내리지 않는다")
        void doesNotGoBelowZero() {
            Comment comment = Comment.create(author, post, "내용", true, null);
            ReflectionTestUtils.setField(comment, "id", 500L);
            when(commentRepository.findById(500L)).thenReturn(Optional.of(comment));

            commentService.deleteComment(500L, 1L);

            assertThat(post.getCommentCount()).isZero();
        }

        @Test
        @DisplayName("없는 댓글이면 ResourceNotFoundException")
        void throwsWhenMissing() {
            when(commentRepository.findById(999L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> commentService.deleteComment(999L, 1L))
                    .isInstanceOf(ResourceNotFoundException.class);
        }
    }

    @Nested
    @DisplayName("목록 조회")
    class Listing {

        @Test
        @DisplayName("게시글의 댓글을 저장소에서 그대로 가져온다")
        void getsCommentsByPost() {
            Comment c1 = Comment.create(author, post, "1", true, null);
            when(commentRepository.findByPost(post)).thenReturn(List.of(c1));

            assertThat(commentService.getCommentsByPost(post)).containsExactly(c1);
        }

        @Test
        @DisplayName("사용자 댓글은 요청한 정렬 기준으로 내림차순 페이징된다")
        void getsCommentsByUserWithSort() {
            Page<Comment> page = new PageImpl<>(List.of());
            when(commentRepository.findByUser(any(), any(Pageable.class))).thenReturn(page);

            commentService.getCommentsByUser(author, 2, 10, SortType.RECENT);

            ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
            verify(commentRepository).findByUser(
                    org.mockito.ArgumentMatchers.eq(author), captor.capture());
            assertThat(captor.getValue()).isEqualTo(PageRequest.of(2, 10,
                    Sort.by(Sort.Direction.DESC, SortType.RECENT.getField())));
        }
    }
}
