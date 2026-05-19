package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.Utils.HotScoreCalculator;
import com.example.highteenday_backend.domain.hot.DailyHotPost;
import com.example.highteenday_backend.domain.hot.DailyHotPostRepository;
import com.example.highteenday_backend.domain.port.HotPostRankingPort;
import com.example.highteenday_backend.domain.port.HotPostRankingPort.ScoredPost;
import com.example.highteenday_backend.domain.posts.Post;
import com.example.highteenday_backend.dtos.PostPreviewDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;


/*게시판별 인기글, 실시간 인기글
 * 실시간 인기글:반응마다 스코어 갱신,5분마다 5개 선정하고 좋아요 컷 10개,하루단위 시간감쇄율
 * 게시판별 인기글:1분마다 스코어 갱신, 1분마다 3개 선정하고 좋아요 컷 5개, 시간감쇄 없이 db 저장
 * */


@Slf4j
@RequiredArgsConstructor
@Service
public class HotPostService {

    /** 일자별 전역 인기글 ZSET: hot:leaderboard:day:{yyyyMMdd} (작성일 필터 아님) */
    public static final String REDIS_LEADERBOARD_DAY_PREFIX = "hot:leaderboard:day:";

    private static final DateTimeFormatter LEADERBOARD_DAY_SUFFIX = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final HotPostRankingPort hotPostRanking;
    private final PostService postService;
    private final DailyHotPostRepository dailyHotPostRepository;
    private static int recentHotPostCount=3;
    private static int dailyHotPostCount=10;

    public static String leaderboardDayRedisKey(LocalDate date) {
        return REDIS_LEADERBOARD_DAY_PREFIX + date.format(LEADERBOARD_DAY_SUFFIX);
    }

    @Transactional
    public void updateRecentScore(Post post){
        Long boardId = post.getBoard().getId();
        Long postId = post.getId();
        String key=getKey(boardId);
        double score = HotScoreCalculator.calculateDailyHotScore(post);
        hotPostRanking.addScore(key, postId, score);
    }

    public List<PostPreviewDto> getRecentHotPosts(Long boardId){
        String key=getKey(boardId);
        List<PostPreviewDto> topPostDtos = new ArrayList<>();
        Set<Long> topPostIds = hotPostRanking.topPostIds(key, recentHotPostCount);
        for(Long pid:topPostIds){
            postService.findOptionalById(pid).ifPresent(post ->
                    topPostDtos.add(PostPreviewDto.fromEntity(post)));
        }
        return topPostDtos;
    }

    @Transactional
    public void updateLeaderboardDayScore(Long postId){
        String key = leaderboardDayRedisKey(LocalDate.now());
        postService.findOptionalById(postId).ifPresentOrElse(post -> {
            double score = HotScoreCalculator.calculateDailyHotScore(post);
            hotPostRanking.addScore(key, postId, score);
            log.debug("hot score updated, postId={} score={}", postId, score);
        }, () -> {
            hotPostRanking.remove(key, postId);
            log.debug("Hot score skipped — post not found in DB, removing from Redis. postId={}", postId);
        });
    }

    public List<PostPreviewDto> getLeaderboardDayHotPosts(){
        String key = leaderboardDayRedisKey(LocalDate.now());
        Set<Long> hotPostsIds = hotPostRanking.topPostIds(key, dailyHotPostCount);
        if (hotPostsIds.isEmpty()) {
            return getLeaderboardDayHotPostsFromDb();
        }
        List<PostPreviewDto> hotPostPrevDtos = new ArrayList<>();
        for(Long pid:hotPostsIds){
            postService.findOptionalById(pid).ifPresent(post -> {
                if (post.getLikeCount() >= 10) {
                    hotPostPrevDtos.add(PostPreviewDto.fromEntity(post));
                }
            });
        }
        return hotPostPrevDtos;
    }

    private List<PostPreviewDto> getLeaderboardDayHotPostsFromDb() {
        List<DailyHotPost> entries = dailyHotPostRepository
                .findTop10ByLeaderboardDateOrderByCreatedDesc(LocalDate.now());
        List<PostPreviewDto> result = new ArrayList<>();
        for (DailyHotPost dhp : entries) {
            Post post = dhp.getPost();
            if (post.getIsValid() && post.getLikeCount() >= 10) {
                result.add(PostPreviewDto.fromEntity(post));
            }
        }
        return result;
    }

    public Set<Long> getLeaderboardDayPostIds(int count) {
        String key = leaderboardDayRedisKey(LocalDate.now());
        return hotPostRanking.topPostIds(key, count);
    }

    @Transactional
    public void syncLeaderboardDayToDb() {
        LocalDate today = LocalDate.now();
        String key = leaderboardDayRedisKey(today);
        List<ScoredPost> scoredPosts = hotPostRanking.topPostsWithScores(key, 50);
        if (scoredPosts.isEmpty()) return;

        int savedCount = 0;
        for (ScoredPost sp : scoredPosts) {
            Optional<Post> postOpt = postService.findOptionalById(sp.postId());
            if (postOpt.isPresent()) {
                Post post = postOpt.get();
                if (dailyHotPostRepository.findByPostAndLeaderboardDate(post, today).isEmpty()) {
                    dailyHotPostRepository.save(DailyHotPost.builder()
                            .post(post)
                            .score(sp.score())
                            .leaderboardDate(today)
                            .build());
                    savedCount++;
                }
            }
        }
        log.info("Synced {} new hot posts to DB fallback", savedCount);
    }

    public String getRealtime5Min(){
        DateTimeFormatter realtimeFormatter = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
        LocalDateTime now = LocalDateTime.now().withSecond(0).withNano(0);
        //5분 단위로 분 설정
        int minute = (now.getMinute() / 5) * 5;
        now = now.withMinute(minute);
        return now.format(realtimeFormatter);
    }

    public String getKey(Long boardId){
        return "hot:board:"+boardId+"realtime:"+getRealtime5Min();
    }
}
