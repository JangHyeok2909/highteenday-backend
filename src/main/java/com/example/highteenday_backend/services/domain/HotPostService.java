package com.example.highteenday_backend.services.domain;

import com.example.highteenday_backend.utils.HotScoreCalculator;
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


/**
 * 핫게시글 랭킹 서비스 — Redis ZSET에 점수를 쌓고 상위 게시글을 조회한다.
 *
 * 실제 서비스 경로는 "일간 리더보드" 하나다.
 * - 갱신: updateLeaderboardDayScore() — 반응/댓글/스크랩 이벤트(AFTER_COMMIT)와
 *   조회수 배치, 그리고 HotScoreScheduler(5분 주기, 시간 감쇠 반영)가 호출한다.
 * - 조회: getLeaderboardDayHotPosts() — GET /api/hotposts/daily. 당일 ZSET 상위
 *   10개 중 좋아요 10개 이상만 노출하고, ZSET이 비면(장애·초기화 직후) DB의
 *   daily_hot_post로 fallback한다. syncLeaderboardDayToDb()가 그 fallback을 채운다.
 *
 * 키는 달력일 버킷(hot:leaderboard:day:{yyyyMMdd})이다 — 게시글 작성일 필터가 아니라,
 * "오늘 점수가 갱신된 글"이 오늘 키에 들어간다. 어제 글도 오늘 반응을 받으면 순위에 든다.
 *
 * updateRecentScore()/getRecentHotPosts()(게시판별 5분 버킷 실시간 랭킹)는 설계만 있고
 * 아직 어떤 컨트롤러·스케줄러에도 연결되지 않았다 — docs/domains/reaction-hotpost.md 참고.
 */
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
