package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.domain.reactions.ReactionKind;
import com.example.highteenday_backend.domain.reactions.ReactionStore;
import com.example.highteenday_backend.domain.reactions.ReactionTarget;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("ReactionService")
class ReactionServiceTest {

    @Mock
    private ReactionStore postStore;

    @Mock
    private ReactionStore commentStore;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    private ReactionService service;

    @BeforeEach
    void setUp() {
        when(postStore.target()).thenReturn(ReactionTarget.POST);
        when(commentStore.target()).thenReturn(ReactionTarget.COMMENT);
        service = new ReactionService(List.of(postStore, commentStore), eventPublisher);
    }

    @Nested
    @DisplayName("findMine")
    class FindMine {

        @Test
        @DisplayName("대상이 없으면 조회하지 않는다")
        void skipsQueryWhenNoTargets() {
            Map<Long, ReactionKind> result = service.findMine(ReactionTarget.COMMENT, List.of(), 1L);

            assertThat(result).isEmpty();
            verify(commentStore, never()).findMine(any(), any());
        }
    }
}
