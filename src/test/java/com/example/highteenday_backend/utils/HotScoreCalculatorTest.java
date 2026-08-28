package com.example.highteenday_backend.utils;

import com.example.highteenday_backend.domain.posts.Post;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

@DisplayName("HotScoreCalculator")
class HotScoreCalculatorTest {

    private Post post(int likeCount, int dislikeCount, int scrapCount, int viewCount, int commentCount,
                      LocalDateTime created) {
        Post post = Post.builder()
                .likeCount(likeCount)
                .dislikeCount(dislikeCount)
                .scrapCount(scrapCount)
                .viewCount(viewCount)
                .commentCount(commentCount)
                .build();
        // created 는 BaseEntity 가 감사(auditing)로 채우는 필드라 빌더에 없다.
        ReflectionTestUtils.setField(post, "created", created);
        return post;
    }

    @Nested
    @DisplayName("calculateRecentHotScore — 시간 감쇠 없는 로그 점수")
    class RecentHotScore {

        @Test
        @DisplayName("좋아요 20개(가중치 5) → 원점수 100 → log10(100) = 2.0")
        void logScaleOfPositiveScore() {
            double score = HotScoreCalculator.calculateRecentHotScore(
                    post(20, 0, 0, 0, 0, LocalDateTime.now()));

            assertThat(score).isEqualTo(2.0);
        }

        @Test
        @DisplayName("싫어요 100개(가중치 1) → 원점수 -100 → 부호가 붙어 -2.0")
        void negativeScoreKeepsSign() {
            double score = HotScoreCalculator.calculateRecentHotScore(
                    post(0, 100, 0, 0, 0, LocalDateTime.now()));

            assertThat(score).isEqualTo(-2.0);
        }

        @Test
        @DisplayName("반응이 하나도 없으면 0.0")
        void zeroWhenNoEngagement() {
            double score = HotScoreCalculator.calculateRecentHotScore(
                    post(0, 0, 0, 0, 0, LocalDateTime.now()));

            assertThat(score).isEqualTo(0.0);
        }

        @Test
        @DisplayName("좋아요 1개가 조회 1회보다 점수를 크게 올린다 (가중치 5 vs 1)")
        void likeWeighsMoreThanView() {
            LocalDateTime created = LocalDateTime.now();
            double byLike = HotScoreCalculator.calculateRecentHotScore(post(1, 0, 0, 0, 0, created));
            double byView = HotScoreCalculator.calculateRecentHotScore(post(0, 0, 0, 1, 0, created));

            assertThat(byLike).isGreaterThan(byView);
        }
    }

    @Nested
    @DisplayName("calculateDailyHotScore — 시간 감쇠 적용")
    class DailyHotScore {

        @Test
        @DisplayName("2시간 전 글, 좋아요 20개 → log10(100)=2.0 을 (2+2)^1.5=8 로 나눈 0.25")
        void appliesTimeDecay() {
            double score = HotScoreCalculator.calculateDailyHotScore(
                    post(20, 0, 0, 0, 0, LocalDateTime.now().minusHours(2)));

            assertThat(score).isEqualTo(0.25, within(1e-6));
        }

        @Test
        @DisplayName("같은 반응이면 오래된 글일수록 점수가 낮다")
        void olderPostScoresLower() {
            double fresh = HotScoreCalculator.calculateDailyHotScore(
                    post(20, 0, 0, 0, 0, LocalDateTime.now().minusHours(1)));
            double old = HotScoreCalculator.calculateDailyHotScore(
                    post(20, 0, 0, 0, 0, LocalDateTime.now().minusHours(24)));

            assertThat(fresh).isGreaterThan(old);
        }

        @Test
        @DisplayName("싫어요가 많아 원점수가 음수면 결과도 음수다")
        void negativeScoreStaysNegative() {
            double score = HotScoreCalculator.calculateDailyHotScore(
                    post(0, 50, 0, 0, 0, LocalDateTime.now().minusHours(2)));

            assertThat(score).isNegative();
        }

        @Test
        @DisplayName("소수점 6자리로 반올림한다")
        void roundsToSixDecimals() {
            double score = HotScoreCalculator.calculateDailyHotScore(
                    post(7, 3, 2, 11, 5, LocalDateTime.now().minusHours(5)));

            assertThat(score * 1_000_000d).isEqualTo(Math.rint(score * 1_000_000d), within(1e-6));
        }
    }
}
