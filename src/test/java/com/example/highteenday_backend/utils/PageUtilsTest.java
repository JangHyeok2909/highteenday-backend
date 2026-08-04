package com.example.highteenday_backend.utils;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PageUtilsTest {

    @Nested
    @DisplayName("createPage")
    class CreatePage {

        private final List<String> ten = List.of("a", "b", "c", "d", "e", "f", "g", "h", "i", "j");

        @Test
        @DisplayName("첫 페이지를 요청 크기만큼 자른다")
        void slicesFirstPage() {
            Page<String> page = PageUtils.createPage(ten, PageRequest.of(0, 3));

            assertThat(page.getContent()).containsExactly("a", "b", "c");
            assertThat(page.getTotalElements()).isEqualTo(10);
            assertThat(page.getTotalPages()).isEqualTo(4);
            assertThat(page.getNumber()).isZero();
        }

        @Test
        @DisplayName("중간 페이지를 offset 기준으로 자른다")
        void slicesMiddlePage() {
            Page<String> page = PageUtils.createPage(ten, PageRequest.of(2, 3));

            assertThat(page.getContent()).containsExactly("g", "h", "i");
            assertThat(page.getNumber()).isEqualTo(2);
        }

        @Test
        @DisplayName("마지막 페이지는 남은 만큼만 담는다")
        void slicesPartialLastPage() {
            Page<String> page = PageUtils.createPage(ten, PageRequest.of(3, 3));

            assertThat(page.getContent()).containsExactly("j");
            assertThat(page.isLast()).isTrue();
        }

        @Test
        @DisplayName("페이지 크기가 전체보다 크면 전부 담는다")
        void handlesPageLargerThanList() {
            Page<String> page = PageUtils.createPage(ten, PageRequest.of(0, 100));

            assertThat(page.getContent()).hasSize(10);
            assertThat(page.getTotalPages()).isEqualTo(1);
        }

        @Test
        @DisplayName("빈 목록의 첫 페이지는 빈 페이지다")
        void handlesEmptyList() {
            Page<String> page = PageUtils.createPage(List.of(), PageRequest.of(0, 10));

            assertThat(page.getContent()).isEmpty();
            assertThat(page.getTotalElements()).isZero();
        }

        @Test
        @DisplayName("경계: 마지막 페이지 바로 다음 페이지는 빈 결과다")
        void returnsEmptyForPageJustPastEnd() {
            // offset(10)이 size(10)와 같은 경우다. subList(10, 10) 은 빈 리스트를 준다.
            Page<String> page = PageUtils.createPage(ten, PageRequest.of(1, 10));

            assertThat(page.getContent()).isEmpty();
            assertThat(page.getTotalElements()).isEqualTo(10);
        }

        @Test
        @DisplayName("범위를 넘는 페이지를 요청하면 예외가 난다 — 빈 페이지가 아니다")
        void throwsWhenPageFarPastEnd() {
            // end = min(start + size, list.size()) 가 start 보다 작아져 subList(start, end) 가 터진다.
            // 컨트롤러에서 page 범위를 막지 않으면 500으로 떨어진다.
            assertThatThrownBy(() -> PageUtils.createPage(ten, PageRequest.of(5, 10)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("fromIndex(50) > toIndex(10)");
        }

        @Test
        @DisplayName("빈 목록에 두 번째 페이지를 요청해도 예외가 난다")
        void throwsForSecondPageOfEmptyList() {
            assertThatThrownBy(() -> PageUtils.createPage(List.of(), PageRequest.of(1, 10)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("fromIndex(10) > toIndex(0)");
        }

        @Test
        @DisplayName("반환된 Page는 원본 Pageable을 유지한다")
        void preservesPageable() {
            Pageable pageable = PageRequest.of(1, 4);

            Page<String> page = PageUtils.createPage(ten, pageable);

            assertThat(page.getPageable()).isEqualTo(pageable);
            assertThat(page.getSize()).isEqualTo(4);
        }
    }
}
