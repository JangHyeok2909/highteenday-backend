# 핫게시글 시스템 분석 및 시스템 다이어그램

---

## 1. 시스템 개요

핫게시글 시스템은 **좋아요·싫어요·스크랩·댓글·조회수**를 반영한 점수로 게시글을 순위화하고, **일간 핫게시글**과 **(설계상) 게시판별 실시간 인기글**을 제공합니다.

| 구분 | 일간 핫게시글 (Daily) | 게시판별 실시간 인기글 (Recent) |
|------|------------------------|----------------------------------|
| Redis 키 | `hot:all:daily:{yyyyMMdd}` | `hot:board:{boardId}realtime:{yyyyMMddHHmm}` (5분 단위) |
| 갱신 주기 | 1분마다 스케줄러가 **전체 게시글** 스코어 갱신 | 반응 발생 시 `updateRecentScore()` 호출 (현재 미연동) |
| 노출 개수 | 상위 10개, **좋아요 ≥ 10**만 응답 | 상위 3개 |
| API | `GET /api/hotposts/daily` | `getRecentHotPosts(boardId)` (API 미노출) |

---

## 2. 구성 요소

### 2.1 클래스 역할

| 클래스 | 역할 |
|--------|------|
| **HotScoreCalculator** | 순수 점수 계산 (가중치 합 → 로그 스케일 → 부호). 시간 감쇠는 Daily 전용 메서드에만 있음. |
| **HotPostService** | Redis ZSET에 점수 적재, 상위 N개 조회, 5분 단위 키 생성. |
| **HotScoreScheduler** | 1분마다 `postService.findAll()` 후 전부 `updateDailyScore()` 호출. |
| **HotPostController** | `GET /api/hotposts/daily` → `getDailyHotPosts()` → `PostPreviewDto` 리스트 반환. |
| **RecentHotPost** | 엔티티/테이블 존재하나, 현재 Redis 기반 랭킹에는 미사용. |

### 2.2 점수 공식 (HotScoreCalculator)

**실시간/일간 공통 (calculateRecentHotScore)**

1. **가중치 합**  
   `score = 5×좋아요 − 1×싫어요 + 2×스크랩 + 3×댓글 + 1×조회수`
2. **로그 스케일**  
   `order = log10(max(|score|, 1))`
3. **부호**  
   `sign = score>0 ? 1 : (score<0 ? -1 : 0)`  
   **반환값**: `sign * order`

**일간 전용 (calculateDailyHotScore)**  
위와 동일한 가중치 합·로그·부호 후, **작성 시각(epoch 이후 초)**을 `DAILY_TIME_DIVISOR(45000)`로 나눈 값을 더해 “최신 글”에 가산을 줌.

### 2.3 Redis 키 설계

| 키 패턴 | 타입 | member | score | 용도 |
|---------|------|--------|-------|------|
| `hot:all:daily:{yyyyMMdd}` | ZSET | postId (String) | calculateRecentHotScore 결과 | 당일 전체 핫게시글 |
| `hot:board:{boardId}realtime:{yyyyMMddHHmm}` | ZSET | postId (String) | 동일 | 게시판별 5분 단위 실시간 인기글 |

동일 postId가 여러 번 `ZADD`되면 **같은 키 안에서는 최신 score로 덮어쓰기**됩니다.

---

## 3. 데이터 흐름 요약

- **쓰기**  
  - **일간**: 1분마다 스케줄러가 DB에서 전체 Post 조회 → 각 Post에 대해 `HotScoreCalculator.calculateRecentHotScore(post)` → `hot:all:daily:{날짜}` ZSET에 `postId–score` 추가.
  - **실시간**: `updateRecentScore(post)`가 호출되면 `hot:board:{boardId}realtime:{5분단위}` ZSET에 동일 방식으로 추가. (현재 좋아요/싫어요 등에서 호출되지 않음)
- **읽기**  
  - **일간**: `ZREVRANGE hot:all:daily:{날짜} 0 9` → postId 10개 → DB에서 Post 조회 → `likeCount >= 10`인 것만 `PostPreviewDto`로 반환.
  - **실시간**: `ZREVRANGE hot:board:{boardId}realtime:{5분} 0 2` → postId 3개 → DB에서 Post 조회 → `toPrevDto()`로 반환.

---

## 4. 시스템 다이어그램

### 4.1 컴포넌트 다이어그램 (핫게시글 영역)

```mermaid
flowchart TB
    subgraph API["API 계층"]
        HotPostController["HotPostController<br/>GET /api/hotposts/daily"]
    end

    subgraph Service["서비스 계층"]
        HotPostService["HotPostService"]
        HotScoreCalculator["HotScoreCalculator<br/>(유틸)"]
        PostService["PostService"]
    end

    subgraph Scheduler["스케줄러"]
        HotScoreScheduler["HotScoreScheduler<br/>@Scheduled(1분)"]
    end

    subgraph Storage["저장소"]
        Redis[("Redis<br/>ZSET")]
        MySQL[("MySQL<br/>posts")]
    end

    HotPostController --> HotPostService
    HotPostService --> HotScoreCalculator
    HotPostService --> PostService
    HotPostService --> Redis
    HotPostService --> MySQL

    HotScoreScheduler --> PostService
    HotScoreScheduler --> HotPostService
    PostService --> MySQL
```

### 4.2 일간 핫게시글 갱신 흐름 (스케줄러)

```mermaid
sequenceDiagram
    participant Scheduler as HotScoreScheduler
    participant PostSvc as PostService
    participant HotSvc as HotPostService
    participant Calc as HotScoreCalculator
    participant Redis as Redis
    participant MySQL as MySQL

    Note over Scheduler: 1분마다 실행
    Scheduler->>PostSvc: findAll()
    PostSvc->>MySQL: SELECT * FROM posts (is_valid 등)
    MySQL-->>PostSvc: List<Post>
    PostSvc-->>Scheduler: List<Post>

    loop 각 Post
        Scheduler->>HotSvc: updateDailyScore(post)
        HotSvc->>Calc: calculateRecentHotScore(post)
        Calc-->>HotSvc: score (double)
        HotSvc->>Redis: ZADD hot:all:daily:{yyyyMMdd} score postId
    end
```

### 4.3 일간 핫게시글 조회 흐름 (API)

```mermaid
sequenceDiagram
    participant Client as Client
    participant Controller as HotPostController
    participant HotSvc as HotPostService
    participant Redis as Redis
    participant PostSvc as PostService
    participant MySQL as MySQL

    Client->>Controller: GET /api/hotposts/daily
    Controller->>HotSvc: getDailyHotPosts()

    HotSvc->>Redis: ZREVRANGE hot:all:daily:{yyyyMMdd} 0 9
    Redis-->>HotSvc: [postId1, postId2, ...]

    loop 각 postId
        HotSvc->>PostSvc: findById(postId)
        PostSvc->>MySQL: SELECT * FROM posts WHERE id=?
        MySQL-->>PostSvc: Post
        PostSvc-->>HotSvc: Post
        alt likeCount >= 10
            HotSvc->>HotSvc: post.toPrevDto() 추가
        end
    end

    HotSvc-->>Controller: List<PostPreviewDto>
    Controller-->>Client: 200 OK, JSON
```

### 4.4 게시판별 실시간 인기글 (설계상, 현재 미연동)

```mermaid
sequenceDiagram
    participant User as 사용자
    participant ReactCtrl as PostReactionController
    participant ReactSvc as PostReactionService
    participant HotSvc as HotPostService
    participant Redis as Redis

    Note over User,Redis: 좋아요/싫어요/스크랩/댓글 시 updateRecentScore 연동 시
    User->>ReactCtrl: POST /api/posts/{id}/like 등
    ReactCtrl->>ReactSvc: likeReact(post, user) 등
    ReactSvc->>ReactSvc: DB 반영 (likeCount 등)

    ReactSvc->>HotSvc: updateRecentScore(post)
    HotSvc->>HotSvc: getRealtime5Min() → yyyyMMddHHmm (5분 단위)
    HotSvc->>HotSvc: calculateRecentHotScore(post)
    HotSvc->>Redis: ZADD hot:board:{boardId}realtime:{5분} score postId
```

### 4.5 점수 계산 내부 로직

```mermaid
flowchart LR
    subgraph Input["Post"]
        L[likeCount]
        D[dislikeCount]
        S[scrapCount]
        C[commentCount]
        V[viewCount]
    end

    subgraph Calc["HotScoreCalculator"]
        W["가중치 합<br/>5L−1D+2S+3C+1V"]
        LOG["log10(max(abs(score),1))"]
        SIGN["sign × order"]
    end

    Input --> W
    W --> LOG
    LOG --> SIGN
    SIGN --> Score["score (double)"]
```

---

## 5. 요약 표

| 항목 | 내용 |
|------|------|
| **스코어 입력** | 좋아요(5), 싫어요(-1 또는 -2), 스크랩(2), 댓글(3), 조회수(1) |
| **스코어 형태** | 부호 있는 로그 스케일 값 (실시간/일간 동일 공식, 일간 전용은 시간 가산 추가) |
| **저장소** | Redis ZSET (키별 상위 N개 조회) |
| **갱신** | 일간: 1분마다 전체 Post 스캔 후 ZSET 갱신. 실시간: 코드는 있으나 반응 핸들러와 미연동 |
| **노출** | 일간 10개, 좋아요 ≥10 필터. 실시간 3개(API 미노출) |
| **엔티티** | RecentHotPost는 DB에만 존재, 현재 Redis 랭킹과는 별개 |

이 문서와 다이어그램을 그대로 시스템 설계서/개발 문서에 활용할 수 있습니다.
