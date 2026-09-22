# DB connection held during Redis wait

> 상태: needs-evidence (관측은 확정, 원인으로 지목한 OSIV 는 미검증)
> 영향도: high (Redis 하나가 느려지면 MySQL 커넥션 풀이 함께 소모된다)
> 대조군 실행: `redis-crash-2026-09-17T07-14-13` (서킷브레이커 없음)
> 비교 실행: `redis-crash-2026-09-17T06-14-24` (서킷브레이커 있음)
> 관련: [Redis failure cascade](redis-failure-cascade.md) — 같은 전파 경로의 앞선 기록

## 결론 (잠정)

Redis 를 60초 중단했을 때 MySQL 커넥션 풀 60개가 최대 60개까지 소모됐다. 커넥션을 쥔 채
Redis 응답을 기다린 것으로 보이지만, **무엇이 쥐고 있었는지는 아직 확정하지 못했다.**

트랜잭션이 쥐고 있었다는 설명은 측정과 맞지 않는다. 장애 구간 Redis 호출 7,400건 중
`@Transactional` 안에서 일어난 것은 580건, **580 ÷ 7,400 = 7.8%** 뿐이다.

가장 잘 맞는 설명은 OSIV(`spring.jpa.open-in-view`)다. 이 값이 명시돼 있지 않아 Spring Boot
기본값 `true` 로 켜져 있고, OSIV 는 EntityManager 를 요청 스레드에 요청이 끝날 때까지 묶는다.
다만 **이 문서는 그 인과를 증명하지 않는다.** 아래 "검증 방법"의 실행이 남아 있다.

## 관측 — 커넥션 점유가 SQL 시간이 아니라 요청 시간을 따라갔다

Hikari 는 커넥션을 빌린 시각과 돌려준 시각의 차이를 직접 잰다
(`hikaricp_connections_usage_seconds`, `_sum ÷ _count` 가 1회 점유 시간).

| 실행 | 구간 | 커넥션 1회 점유 | 요청 1건 소요 | 점유/요청 | 초당 체크아웃 |
|---|---|---:|---:|---:|---:|
| 대조군 | pre | 28.36ms | 45.38ms | 62% | 479 |
| 대조군 | fault | 57.56ms | 119.89ms | 48% | 515 |
| 서킷 | pre | 19.92ms | 32.56ms | 61% | 473 |
| 서킷 | fault | 27.38ms | 47.18ms | 58% | 563 |

네 칸 모두 점유/요청이 48~62% 구간에 있다. **요청이 느려지면 커넥션 점유도 같이 느려진다.**
커넥션을 SQL 실행 동안만 쥔다면 이 비율은 Redis 장애 때 크게 떨어져야 한다 — 요청은 Redis
대기 때문에 길어지지만 SQL 자체는 그만큼 길어지지 않기 때문이다. 대조군에서 요청이
45.38 → 119.89ms 로 2.64배가 되는 동안 점유는 28.36 → 57.56ms 로 2.03배가 됐다.

### 풀이 찬 것은 빌린 횟수가 아니라 쥔 시간 때문이다

동시에 반납 안 된 커넥션 수는 초당 체크아웃 × 1회 점유 시간이다.

- 대조군 pre: 479 × 0.02836초 = **13.6개**
- 대조군 fault: 515 × 0.05756초 = **29.6개**

2.2배가 됐는데 체크아웃 횟수는 479 → 515/s 로 7.5% 늘었을 뿐이다. 나머지는 전부 점유 시간에서
나온다. 계기판 게이지(`hikaricp_connections_active`)의 구간 최댓값은 pre 9개, fault **60개**로
풀 전체에 해당한다.

| 지표 | 대조군 pre | 대조군 fault | 서킷 fault |
|---|---:|---:|---:|
| Hikari active 평균 / 최대 | 7.3 / 9 | 33.5 / **60** | 19.3 / 35 |
| MySQL threads_running 평균 / 최대 | 10.0 / 19 | 20.8 / 42 | 14.3 / 23 |
| Tomcat busy 평균 / 최대 | 6.5 / 8 | 31.5 / **50** | 16.3 / 35 |
| 커넥션 획득 대기 평균 | - | 0.25ms | 0.21ms |

**획득 대기가 0.25ms 라는 점이 중요하다.** 풀을 다 썼지만 커넥션을 기다린 요청은 없었다. 즉
이 실행은 포화 직전에서 멈췄다. 도착률을 더 올리면 여기서 대기가 쌓이고,
[redis-failure-cascade.md](redis-failure-cascade.md) 가 기록한 전파(Redis 를 안 쓰는 기능과
인증까지 실패)가 다시 일어난다.

## 배제한 설명 — 트랜잭션이 쥐고 있다

이 저장소에서 Redis 호출이 `@Transactional` 안에 있는 곳은 세 군데다.

- `HotPostService.updateLeaderboardDayScore` → `addScore`
- `TokenService.saveOrUpdate` → `tokenCache.delete`, `put`
- `TokenService.deleteByUserEmail` → `tokenCache.delete`

대조군 장애 구간의 메서드별 폴백에서 이 경로들은 `addScore` 382 + `put` 116 + `delete` 82
= 580건이다. 전체 7,400건의 7.8% 다.

나머지 92.2% 는 트랜잭션 밖이다. 쓰기 경로는 `PostService` 가 `AfterCommitExecutor` 로 캐시
갱신을 커밋 뒤로 미루고, 읽기 경로(`getPagedPosts`, `getPostCount`,
`getLeaderboardDayHotPosts`)와 `ViewCountService.increaseViewCount` 에는 `@Transactional` 이
없다. 클래스 레벨 `@Transactional` 도 없다.

**7.8% 로는 풀이 9개에서 60개로 가는 것을 설명할 수 없다.** 그래서 트랜잭션이 아닌 다른 것이
커넥션을 쥐고 있다.

## OSIV 를 의심하는 이유

1. **켜져 있다.** `spring.jpa.open-in-view` 가 어느 프로파일에도 명시돼 있지 않아 Spring Boot
   기본값 `true` 가 적용된다. 앱 기동 로그에 해당 경고가 남는다.
   ```
   JpaWebConfiguration : spring.jpa.open-in-view is enabled by default.
   ```
2. **동작이 관측과 맞는다.** OSIV 는 EntityManager 를 요청 스레드에 묶고 **요청이 끝날 때**
   닫는다. Hibernate 의 커넥션 반납 시점 기본값은 resource-local 에서
   `DELAYED_ACQUISITION_AND_RELEASE_AFTER_TRANSACTION` 이라 "트랜잭션이 끝나면 반납"인데,
   트랜잭션 **밖**에서 실행된 쿼리에는 반납 기준이 되는 경계가 없다. 그런 쿼리가 잡은 커넥션은
   EntityManager 가 닫힐 때까지, 즉 요청이 끝날 때까지 남는다.
3. **그런 쿼리가 실제로 있다.** `Post` 의 `user` 와 `board` 가
   `@ManyToOne(fetch = FetchType.LAZY)` 이고, `PostPreviewDto.fromEntity` 가
   `post.getUser().getNicknameValue()` 와 `post.getBoard().getId()` 를 부른다. 이 변환이
   트랜잭션 밖에서 실행되면 그 자리에서 지연 로딩 쿼리가 나간다.

## 이 문서가 증명하지 못한 것

**OSIV 가 커넥션을 쥐었다는 직접 증거가 없다.** 위 세 가지는 "켜져 있고, 그 동작이라면 이
관측이 나온다"까지다. 실제로 그 경로를 밟았는지는 확인하지 않았다. 지연 로딩이 트랜잭션 밖에서
몇 번 일어났는지, 그때 커넥션이 언제 반납됐는지를 재지 않았다.

서킷브레이커 실행과의 비교도 원인을 가리지 못한다. 서킷은 요청 시간을 줄였을 뿐이고,
점유/요청 비율은 48~62% 로 양쪽이 같다. **비율이 안 변했다는 것은 결합이 그대로라는 뜻**이지
그 결합의 주체가 무엇인지는 말해 주지 않는다.

## 검증 방법

`spring.jpa.open-in-view=false` 하나만 바꾸고 같은 계획(`redis-crash.json`)을 같은 환경
(HIKARI_MAX=60, 도착률 60/s, 데이터셋 medium 지문 24ddff07519b)에서 돌린다. 서킷브레이커는
없는 쪽(대조군 이미지)으로 맞춰 변수를 하나만 둔다.

판정 기준은 **점유/요청 비율**이다.

- 비율이 48~62% 에서 크게 떨어지고 fault 구간 Hikari active 최대가 60 아래로 내려가면
  OSIV 가 원인이다.
- 비율이 그대로면 커넥션을 쥐는 다른 곳이 있다. 그때는 `hikaricp_connections_usage_seconds`
  를 엔드포인트별로 나눠 어느 요청이 오래 쥐는지부터 좁힌다.

끄면 지연 로딩이 트랜잭션 밖에서 깨지므로 `LazyInitializationException` 이 난다. 범위는 아래에
적었다.

## 끄면 깨지는 곳 — 영향 범위

엔티티에 선언된 지연 로딩 연관은 `FetchType.LAZY` 명시만 36개(19개 엔티티)다. 그중 **DTO 변환이
실제로 건드리는 연관**을 찾고, 그 변환이 트랜잭션 안에서 불리는지 밖에서 불리는지로 갈랐다.
트랜잭션 밖이면 OSIV 가 없을 때 영속성 컨텍스트가 이미 닫혀 있어 프록시를 채울 수 없다.

### 깨지는 호출 14곳 / 컨트롤러 6개

| 엔드포인트 | 깨지는 지점 | 건드리는 연관 | 부하 경로 |
|---|---|---|:---:|
| `GET /api/posts/{postId}` | `PostController:40` → `PostDto.fromEntity` | `Post.user`, `Post.board` | ✔ |
| `GET /api/posts/search` | `PostController:80` → `PageUtils:21` → `PostPreviewDto.fromEntity` | `Post.user`, `Post.board` | ✔ |
| `GET /api/hotposts/daily` | `HotPostController:24` → `HotPostService:122` | `Post.user`, `Post.board` | ✔ |
| 〃 (Redis 장애 시 DB 폴백) | `HotPostService:136` `getLeaderboardDayHotPostsFromDb` | `Post.user`, `Post.board` | ✔ |
| 댓글 목록 2곳 | `CommentController:48,77` → `CommentAnonymizationService:37` → `CommentDto.fromEntity` | `Comment.user`, `.post`, `.parent` | |
| 마이페이지 게시글 2곳 | `MypageController:50,74` → `PageUtils:21` | `Post.user`, `Post.board` | |
| 마이페이지 댓글 | `MypageController:60` → `PageUtils:38` → `CommentDto.fromEntity` | `Comment.user`, `.post`, `.parent` | |
| 급식 조회 2곳 | `SchoolMealController:37,47` → `SchoolMealService:67` | `SchoolMeal.school` | |
| 시간표 3곳 | `UserTimetableController:60,77,94` → `UserTimetableDto.fromEntity` | `UserTimetable.subject` | |

**인기글 DB 폴백(`getLeaderboardDayHotPostsFromDb`)이 특히 나쁘다.** 이 경로는 Redis 가 죽어
ZSET 조회가 빈 결과를 줄 때만 탄다. 즉 OSIV 를 끈 상태에서 Redis 장애가 나면, 커넥션 점유를
줄이려고 한 변경이 **바로 그 장애 구간에서 인기글을 500 으로 떨어뜨린다.**

### 안 깨지는 곳

트랜잭션 안에서 변환하므로 영향이 없다.

- `ChatService` 전부 — `getMembers`, `getReadStatus`, `getChatMessages`, `sendMessage`,
  `leaveRoom`, `kickMember`, `changeRole` 이 모두 `@Transactional`. private 인
  `withRelations`·`writeSystemMessage` 도 이들에서만 불린다.
- `NotificationService`, `FriendService` — 클래스 레벨 `@Transactional`
- `TimetableTemplateService.getFriendDefaultTemplate`, `SchoolMealService.getMealsByMonth` — `@Transactional`
- `PostService.createPost` — `@Transactional` 이고, 커밋 뒤 실행되는 블록에서 쓸 DTO 를
  트랜잭션 안에서 미리 만들어 둔다. 이 코드 주석이 같은 함정을 이미 기록하고 있다.

`HotPostService.getRecentHotPosts` 는 호출처가 없다. 클래스 javadoc 이 "설계만 있고"라고 적어 둔
대로 쓰이지 않는다.

### 부하 테스트가 잡아 주는 범위

장애 실험이 때리는 경로는 게시글 상세·게시글 검색·인기글이다. 위 14곳 중 **4곳**이 여기 걸리므로
`open-in-view=false` 로 실행하면 그 자리에서 500 이 관측된다. 나머지 10곳(댓글, 마이페이지, 급식,
시간표)은 부하가 안 밟으므로 **실행이 통과해도 안전하다는 뜻이 아니다.** 그쪽은 코드로 확인하거나
별도 요청으로 확인해야 한다.

### 고치는 방법

깨지는 14곳의 공통 모양은 "엔티티를 컨트롤러까지 들고 나가서 거기서 DTO 로 바꾼다"이다. 두 가지로
푼다.

- **변환을 트랜잭션 안으로 옮긴다** — 서비스 메서드에 `@Transactional(readOnly = true)` 를 붙이고
  DTO 까지 만들어 돌려준다. `PostService.createPost` 가 이미 쓰는 방식이고 변경량이 가장 작다.
- **fetch join 또는 DTO projection** — 처음부터 필요한 연관을 같이 읽거나 엔티티를 안 거친다.
  `comment-query-amplification.md` 가 댓글 목록에서 쓴 방법이다. 쿼리 수까지 같이 줄지만
  repository 를 손봐야 한다.

## 반증 조건

- `open-in-view=false` 로 돌렸는데 점유/요청 비율이 그대로면 OSIV 설명이 틀린 것이다.
- 장애 구간 Redis 호출 중 트랜잭션 안에서 일어난 비율이 7.8% 보다 훨씬 크게 나오면
  "트랜잭션이 아니다"라는 배제가 틀린 것이다.
- 커넥션 획득 대기가 0.25ms 인데도 응답 지연이 커넥션 부족 때문이라고 설명되면, 풀이 병목이
  아니라 다른 자원이 병목이라는 뜻이다.

## 다음

1. `open-in-view=false` 실행으로 인과를 확정한다. 확정되면 이 문서의 상태를 `diagnosed` 로
   바꾸고 잠정 표시를 걷는다.
2. 끄기 전에 `LazyInitializationException` 이 날 지점을 전수 조사한다. 엔티티를 트랜잭션 밖으로
   내보낸 뒤 LAZY 연관을 건드리는 경로가 대상이다.
3. 도착률을 올려 커넥션 획득 대기가 실제로 쌓이는 지점을 찾는다. 이번 실행은 대기 0.25ms 로
   포화 직전에서 멈췄고, 그 너머가 `redis-failure-cascade.md` 가 기록한 전면 실패 구간이다.

## 원자료

- 대조군: [report.html](../resilience/reports/redis-crash-2026-09-17T07-14-13/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-17T07-14-13/run.json)
- 서킷: [report.html](../resilience/reports/redis-crash-2026-09-17T06-14-24/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-17T06-14-24/run.json)
- 커넥션 점유 시간은 `run.json` 에 없다. Prometheus 질의는 아래와 같다.
  ```
  1000 * sum(increase(hikaricp_connections_usage_seconds_sum{job="spring-app"}[60s]))
      / sum(increase(hikaricp_connections_usage_seconds_count{job="spring-app"}[60s]))
  1000 * sum(increase(http_server_requests_seconds_sum{job="spring-app",uri!~"/actuator.*"}[60s]))
      / sum(increase(http_server_requests_seconds_count{job="spring-app",uri!~"/actuator.*"}[60s]))
  ```
- 관련 코드: `Post`(LAZY 연관), `PostPreviewDto.fromEntity`, `PostService`, `AfterCommitExecutor`
