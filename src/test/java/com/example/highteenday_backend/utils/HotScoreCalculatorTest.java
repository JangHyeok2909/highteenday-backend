package com.example.highteenday_backend.utils;

import com.example.highteenday_backend.Utils.HotScoreCalculator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;



public class HotScoreCalculatorTest {

    @Test
    void calculateRecentHotScoreTest() {
        int likeCount,dislikeCount,scrapCount,viewCount,commentCount;
        double score;
        LocalDateTime createdAt;

        likeCount = 10;
        dislikeCount = 10;
        scrapCount = 10;
        viewCount = 10;
        commentCount = 10;
        createdAt = LocalDateTime.of(2025, 1, 1, 1, 1);

        score = HotScoreCalculator.calculateRecentHotScoreTest(likeCount, dislikeCount, scrapCount, viewCount, commentCount, createdAt);
        System.out.println("default="+score);

        likeCount = 20;
        dislikeCount = 10;
        scrapCount = 10;
        viewCount = 10;
        commentCount = 10;
        createdAt = LocalDateTime.of(2025, 1, 1, 1, 1);
        score = HotScoreCalculator.calculateRecentHotScoreTest(likeCount, dislikeCount, scrapCount, viewCount, commentCount, createdAt);
        System.out.println("bigLike="+score);

        likeCount = 10;
        dislikeCount = 10;
        scrapCount = 20;
        viewCount = 10;
        commentCount = 10;
        createdAt = LocalDateTime.of(2025, 1, 1, 1, 1);
        score = HotScoreCalculator.calculateRecentHotScoreTest(likeCount, dislikeCount, scrapCount, viewCount, commentCount, createdAt);
        System.out.println("bigScrap="+score);

        likeCount = 10;
        dislikeCount = 10;
        scrapCount = 10;
        viewCount = 30;
        commentCount = 10;
        createdAt = LocalDateTime.of(2025, 1, 1, 1, 1);
        score = HotScoreCalculator.calculateRecentHotScoreTest(likeCount, dislikeCount, scrapCount, viewCount, commentCount, createdAt);
        System.out.println("bigView="+score);

        likeCount = 10;
        dislikeCount = 10;
        scrapCount = 10;
        viewCount = 10;
        commentCount = 20;
        createdAt = LocalDateTime.of(2025, 1, 1, 1, 1);
        score = HotScoreCalculator.calculateRecentHotScoreTest(likeCount, dislikeCount, scrapCount, viewCount, commentCount, createdAt);
        System.out.println("bigComments="+score);

        likeCount = 10;
        dislikeCount = 10;
        scrapCount = 10;
        viewCount = 10;
        commentCount = 10;
        createdAt = LocalDateTime.of(2025, 1, 1, 3, 1);
        score = HotScoreCalculator.calculateRecentHotScoreTest(likeCount, dislikeCount, scrapCount, viewCount, commentCount, createdAt);
        System.out.println("bigRecent="+score);

    }

}
