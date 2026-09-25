package com.example.highteenday_backend.domain.comments;

import com.example.highteenday_backend.domain.reactions.MyReaction;
import com.example.highteenday_backend.domain.reactions.ReactionKind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collection;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("CommentReactionStore")
class CommentReactionStoreTest {

    private static final Long USER_ID = 1L;

    @Mock
    private CommentRepository commentRepository;

    @Mock
    private CommentReactionRepository commentReactionRepository;

    @InjectMocks
    private CommentReactionStore store;

    @Nested
    @DisplayName("findMine")
    class FindMine {

        /**
         * 게시글 조회 시 댓글 리스트 조회를 하는데, 이때 댓글 하나 당 반응 조회 쿼리는 한번만 나가게 한다.
         */
        @Test
        @DisplayName("댓글이 몇 개든 조회는 한 번만 한다")
        void queriesOnce() {
            when(commentReactionRepository.findMine(eq(USER_ID), anyCollection())).thenReturn(List.of());

            store.findMine(List.of(1L, 2L, 3L, 4L, 5L), USER_ID);

            verify(commentReactionRepository, times(1)).findMine(eq(USER_ID), anyCollection());
            verifyNoMoreInteractions(commentReactionRepository);
        }

        @Test
        @DisplayName("목록에 있는 댓글 id 전부를 한 번에 넘긴다")
        @SuppressWarnings("unchecked")
        void passesEveryCommentId() {
            when(commentReactionRepository.findMine(eq(USER_ID), anyCollection())).thenReturn(List.of());

            store.findMine(List.of(7L, 8L, 9L), USER_ID);

            ArgumentCaptor<Collection<Long>> captor = ArgumentCaptor.forClass(Collection.class);
            verify(commentReactionRepository).findMine(eq(USER_ID), captor.capture());
            assertThat(captor.getValue()).containsExactly(7L, 8L, 9L);
        }

        @Test
        @DisplayName("반응 종류를 댓글 id 로 찾을 수 있게 돌려준다")
        void mapsKindByCommentId() {
            when(commentReactionRepository.findMine(eq(USER_ID), anyCollection()))
                    .thenReturn(List.of(
                            new MyReaction(1L, ReactionKind.LIKE),
                            new MyReaction(3L, ReactionKind.DISLIKE)));

            Map<Long, ReactionKind> result = store.findMine(List.of(1L, 2L, 3L), USER_ID);

            assertThat(result).containsEntry(1L, ReactionKind.LIKE);
            assertThat(result).containsEntry(3L, ReactionKind.DISLIKE);
        }

        @Test
        @DisplayName("반응이 없는 댓글은 맵에 없다")
        void omitsCommentsWithoutReaction() {
            // 호출부는 `kind == LIKE` 로 읽는다. 없는 키가 null 이면 그 비교가 그대로
            // false 라, "반응 없음"을 나타내는 별도 값을 만들 이유가 없다.
            when(commentReactionRepository.findMine(eq(USER_ID), anyCollection()))
                    .thenReturn(List.of(new MyReaction(1L, ReactionKind.LIKE)));

            Map<Long, ReactionKind> result = store.findMine(List.of(1L, 2L), USER_ID);

            assertThat(result).doesNotContainKey(2L);
            assertThat(result.get(2L)).isNull();
        }
    }
}
