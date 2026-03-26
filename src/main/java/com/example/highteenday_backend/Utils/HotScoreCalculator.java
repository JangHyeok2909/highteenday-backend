package com.example.highteenday_backend.Utils;

import com.example.highteenday_backend.domain.posts.Post;

import java.time.*;

public class HotScoreCalculator {
    private static final double DAILY_TIME_DIVISOR = 45000.0; //시간감쇄 가중치
    private static final ZonedDateTime epoch = ZonedDateTime.of(1970, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC); // 고정된 기준 시간

    public static double calculateRecentHotScore(Post post){
        // 가중치
        final double W_Likes = 5.0;
        final double W_DISLIKES = 1.0;
        final double W_SCRAPS = 2.0;
        final double W_COMMENTS = 3.0;
        final double W_VIEWS = 1.0;

        int likeCount = post.getLikeCount();
        int dislikeCount = post.getDislikeCount();
        int scrapCount = post.getScrapCount();
        int viewCount = post.getViewCount();
        int commentCount = post.getCommentCount();

        // 1) 각 항목별 가중치를 반영해 총 점수 계산
        double score = W_Likes * likeCount
                - W_DISLIKES * dislikeCount
                + W_SCRAPS * scrapCount
                + W_COMMENTS * commentCount
                + W_VIEWS * viewCount;

        // 2) 로그 스케일 변환 (최소값 1로 보정)
        double order = Math.log10(Math.max(Math.abs(score), 1));

        // 3) 점수 부호 계산 (양수:1, 음수:-1, 0:0)
        int sign = (score > 0) ? 1 : (score < 0) ? -1 : 0;
        return sign*order;
    }


    public static double calculateDailyHotScore(Post post){
        final double W_LIKES = 5.0;
        final double W_DISLIKES = 2.0;
        final double W_SCRAPS = 2.0;
        final double W_COMMENTS = 3.0;
        final double W_VIEWS = 1.0;

        int likeCount = post.getLikeCount();
        int dislikeCount = post.getDislikeCount();
        int scrapCount = post.getScrapCount();
        int viewCount = post.getViewCount();
        int commentCount = post.getCommentCount();

        LocalDateTime createdAt = post.getCreated();

        // 1) 기본 점수
        double score = W_LIKES * likeCount
                - W_DISLIKES * dislikeCount
                + W_SCRAPS * scrapCount
                + W_COMMENTS * commentCount
                + W_VIEWS * viewCount;

        // 2) 로그 스케일
        double order = Math.log10(Math.max(Math.abs(score), 1));
        int sign = (score > 0) ? 1 : (score < 0) ? -1 : 0;

        // 3) 경과 시간 (시간 단위)
        double ageHours = Duration.between(createdAt, LocalDateTime.now()).toMinutes() / 60.0;

        // 4) 감쇠 적용 (핵심)
        double decay = Math.pow(ageHours + 2, 1.5);

        return Math.round((sign * order / decay) * 1_000_000d) / 1_000_000d;
    }


    public static double calculateRecentHotScoreTest(int likeCount, int dislikeCount, int scrapCount, int viewCount, int commentCount, LocalDateTime createdAt){
        // 가중치
        final double W_Likes = 5.0;
        final double W_DISLIKES = 2.0;
        final double W_SCRAPS = 2.0;
        final double W_COMMENTS = 3;
        final double W_VIEWS = 1;

        // 1) 각 항목별 가중치를 반영해 총 점수 계산
        double score = W_Likes * likeCount
                - W_DISLIKES * dislikeCount
                + W_SCRAPS * scrapCount
                + W_COMMENTS * commentCount
                + W_VIEWS * viewCount;

        // 2) 로그 스케일 변환 (최소값 1로 보정)
        double order = Math.log10(Math.max(Math.abs(score), 1));

        // 3) 점수 부호 계산 (양수:1, 음수:-1, 0:0)
        int sign = (score > 0) ? 1 : (score < 0) ? -1 : 0;
        return sign*order;
    }
}
