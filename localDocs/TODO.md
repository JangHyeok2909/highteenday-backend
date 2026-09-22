# 할 일 목록

개인 작업 백로그다. 성능 측정 시스템의 발견 사항은 여기가 아니라 `performance/docs/findings/` 에 쓴다.
여기에는 **애플리케이션 코드를 고쳐야 끝나는 일**만 번호를 붙여 적는다.

## 항목 형식

```markdown
## N. 제목 — 상태: 미착수

**무엇을** — 한 문장.
**왜** — 안 고치면 무엇이 어떻게 깨지고, 그것을 어떻게 관찰하는가.
**어디를** — `경로:줄번호` 와 그 줄이 하는 일.
**완료 기준** — 무엇이 참이면 끝났다고 말할 수 있는가.
```

상태 값은 넷이다.

- **미착수** — 적어만 둔 상태
- **진행중** — 브랜치에서 작업 중
- **완료** — 코드 수정 + 테스트까지. 날짜 병기
- **보류** — 일부러 안 하기로 한 것. **날짜와 이유를 반드시 병기**

---

## 1. API를 멱등하게 만들기 — 상태: 미착수

**무엇을** — 재시도가 일어나도 사용자 의도와 다른 상태가 남지 않도록 8개 엔드포인트의 계약을 바꾼다.

### 멱등이 무슨 뜻인가

같은 요청을 한 번 보내나 두 번 보내나 **서버에 남는 최종 상태가 같으면** 그 요청은 멱등하다.
판단 기준은 저장된 상태이지 응답 코드가 아니다. 두 번째 요청이 404를 돌려줘도 DB가 같은 상태면
멱등하다.

### 왜 지금 문제인가

클라이언트는 응답을 못 받았을 때 두 경우를 구분할 수 없다.

| 실제로 일어난 일 | 클라이언트가 보는 것 |
|---|---|
| 서버가 요청을 받지 못했다 | 응답 없음 |
| 서버가 처리를 끝냈는데 응답이 네트워크에서 유실됐다 | 응답 없음 |

둘 다 "응답 없음"이므로 클라이언트는 재시도한다. 첫 번째 경우에는 재시도가 맞고, 두 번째
경우에는 같은 요청이 서버에 두 번 도착한다. 아래 목록은 **두 번째 경우에 사용자 의도와 다른
상태가 남는 자리**다.

HTTP 규약상 POST는 멱등할 의무가 없다. 그러니 이 목록은 규약 위반 목록이 아니라,
**모바일처럼 재시도가 일상인 환경에서 실제로 틀린 결과를 내는 자리** 목록이다.

---

### 1-A. 재시도하면 방금 한 일이 취소된다 — 토글 3개

가장 나쁜 종류다. 재시도할수록 사용자가 원한 상태에서 멀어진다.

| 엔드포인트 | 진입점 | 뒤집는 코드 |
|---|---|---|
| `POST /api/posts/{postId}/reaction?type=LIKE\|DISLIKE` | [PostReactionController.java:26](../src/main/java/com/example/highteenday_backend/controllers/PostReactionController.java#L26) | [PostReactionService.java:35, 46](../src/main/java/com/example/highteenday_backend/services/domain/PostReactionService.java#L35) |
| `POST /api/comments/{commentId}/reaction?type=LIKE\|DISLIKE` | [CommentReactionController.java:26](../src/main/java/com/example/highteenday_backend/controllers/CommentReactionController.java#L26) | [CommentReactionService.java:33, 47](../src/main/java/com/example/highteenday_backend/services/domain/CommentReactionService.java#L33) |
| `POST /api/posts/{postId}/scraps` | [ScrapController.java:21](../src/main/java/com/example/highteenday_backend/controllers/ScrapController.java#L21) | [ScrapService.java:58](../src/main/java/com/example/highteenday_backend/services/domain/ScrapService.java#L58) |

**셋 다 같은 모양이다.** 요청이 "어떤 상태를 원한다"가 아니라 "지금 상태를 뒤집어라"로 동작한다.

`PostReactionService.java:35`의 `likeReact()` 는 현재 상태를 먼저 읽고 분기한다.

```java
boolean liked = isLikedByUser(post, user);
boolean disliked = isDislikedByUser(post, user);
if (liked && !disliked) {
    cancelState(post, user);                     // 이미 좋아요면 → 취소
} else {
    createReaction(post, user, ReactionKind.LIKE); // 아니면 → 좋아요
}
```

`ScrapService.java:58`도 같다. `alreadyScraped` 가 true면 `cancelScrap()`, false면 `upsertActive()` 다.

지하철에서 하트를 눌렀는데 터널에 들어가 응답을 못 받고 앱이 재시도하면, 두 번째 요청이
`liked == true` 를 보고 **좋아요를 취소한다.** 사용자는 한 번 눌렀는데 결과는 안 누른 것이 된다.
응답은 두 번 다 200이라 어느 쪽도 실패를 알아채지 못한다.

**왜 이렇게 됐나** — URL에 원하는 상태를 담을 자리가 없다. `type=LIKE` 는 "어느 반응인가"를
말할 뿐 "켜 달라"인지 "꺼 달라"인지 말하지 않는다. 클라이언트가 목표 상태를 말할 방법 자체가
없는 것이 원인이다.

**고치는 방향** — 켜기와 끄기를 다른 메서드로 나눈다.

```text
PUT    /api/posts/{postId}/like      → 좋아요 상태로 만든다 (이미 그 상태면 아무 일도 안 일어난다)
DELETE /api/posts/{postId}/like      → 좋아요를 해제한다
```

프론트엔드는 이미 현재 상태를 알고 있다. 게시글 상세 응답이 `liked`·`disliked`·`scrapped` 를
담아 내려보내기 때문이다([PostReactionService.java:56 `getLikeSatateDto()`](../src/main/java/com/example/highteenday_backend/services/domain/PostReactionService.java#L56)).
그래서 `PUT` 과 `DELETE` 중 무엇을 부를지 고르는 것은 클라이언트에서 어렵지 않다.

**주의** — 이 변경은 프론트엔드 계약을 바꾼다. 백엔드만 고쳐서 끝나지 않는다.

---

### 1-B. 재시도하면 로그아웃된다 — 토큰 재발급 1개

| 엔드포인트 | 진입점 |
|---|---|
| `POST /api/token/refresh` | [TokenController.java:26](../src/main/java/com/example/highteenday_backend/controllers/TokenController.java#L26) |

호출 순서는 이렇다.

1. [TokenProvider.java:72 `reissueTokens()`](../src/main/java/com/example/highteenday_backend/security/TokenProvider.java#L72) 가 받은 refresh 토큰의 서명·만료를 검증한다.
2. 같은 파일 77줄에서 `tokenService.findByRefreshTokenOrThrow()` 로 **서버에 살아 있는 토큰인지** 확인한다.
3. 83줄에서 새 refresh 토큰을 발급하고 [TokenService.java:52 `saveOrUpdate()`](../src/main/java/com/example/highteenday_backend/services/domain/TokenService.java#L52) 를 부른다.
4. `saveOrUpdate()` 는 62줄에서 **옛 토큰의 Redis 키를 지우고**, 64줄에서 DB 행의 refresh 토큰을 새 값으로 덮어쓴다.

즉 재발급 한 번이 옛 refresh 토큰을 즉시 무효로 만든다(rotation). 새 토큰은 응답의
`Set-Cookie` 로만 클라이언트에 전달된다([TokenController.java:36](../src/main/java/com/example/highteenday_backend/controllers/TokenController.java#L36)).

**응답이 유실되면** 클라이언트 쿠키에는 아직 옛 refresh 토큰이 남아 있다. 그 토큰으로 재시도하면
2번 단계에서 Redis에도 DB에도 없는 토큰이 되어 `INVALID_TOKEN` 으로 401이 나간다. 사용자는
**로그인이 풀린다.** 관찰 방법은 인증 실패 로그에서 `INVALID_TOKEN` 이 재발급 직후에 몰리는지
보는 것이다.

**고치는 방향 두 가지.**

- **유예 기간** — 직전 refresh 토큰을 짧은 시간(예: 30초) 더 유효하게 두고, 그 토큰으로 다시
  들어오면 **새로 발급하지 말고 직전에 발급한 것과 같은 토큰 쌍을 돌려준다.** 이러면 재시도가
  같은 결과를 낸다.
- **재사용 감지** — 토큰마다 식별자(jti)와 계보를 두고, 무효화된 토큰이 다시 오면 그 계보 전체를
  폐기한다. 재시도는 살리지 못하지만 탈취는 잡는다.

**먼저 정해야 하는 것** — rotation을 넣은 목적은 탈취된 refresh 토큰의 재사용을 막는 것이다.
유예 기간은 그 목적을 30초만큼 약하게 만든다. 이 교환을 받아들일지가 이 항목의 실제 결정이고,
코드 수정은 그다음이다.

---

### 1-C. 재시도하면 두 개가 만들어진다 — 생성 4개

| 엔드포인트 | 진입점 | 생성 지점 | 재시도하면 |
|---|---|---|---|
| `POST /api/posts` | [PostController.java:48](../src/main/java/com/example/highteenday_backend/controllers/PostController.java#L48) | [PostService.java:95 `createPost()`](../src/main/java/com/example/highteenday_backend/services/domain/PostService.java#L95) | 같은 글 2개 |
| `POST /api/posts/{postId}/comments` | [CommentController.java:88](../src/main/java/com/example/highteenday_backend/controllers/CommentController.java#L88) | [CommentService.java:55 `createComment()`](../src/main/java/com/example/highteenday_backend/services/domain/CommentService.java#L55) | 같은 댓글 2개 |
| `POST /api/chat/rooms/group` | [ChatController.java:40](../src/main/java/com/example/highteenday_backend/controllers/ChatController.java#L40) | [ChatService.java:88 `createGroupRoom()`](../src/main/java/com/example/highteenday_backend/services/domain/ChatService.java#L88) | 같은 멤버의 방 2개 |
| `POST /api/media` | [MediaController.java:35](../src/main/java/com/example/highteenday_backend/controllers/MediaController.java#L35) | [S3FileStorageAdapter.java:29 `tmpUpload()`](../src/main/java/com/example/highteenday_backend/services/global/S3FileStorageAdapter.java#L29) | S3 tmp 객체가 하나 더 쌓인다 |

넷 다 중복을 막는 제약이 없다. 같은 본문으로 두 번 도착하면 행이 두 개 생긴다.

`POST /api/media` 만 성격이 조금 다르다. 업로드된 tmp 객체는 이후
`PATCH /api/media/profile-image`([MediaController.java:46](../src/main/java/com/example/highteenday_backend/controllers/MediaController.java#L46))가
확정 위치로 옮겨야 쓰인다. 확정되지 않은 tmp 객체를 지우는 스케줄러는 없다 —
`schedulers/` 에 있는 것은 `HotScoreScheduler`, `SchoolMealScheduler`, `TokenCleanupScheduler`,
`ViewCountScheduler` 넷뿐이다. 그래서 재시도로 생긴 tmp 객체는 S3에 영구히 남아 용량 요금만
늘린다. 관찰 방법은 S3 tmp 접두사의 객체 수가 프로필 변경 횟수보다 많은지 보는 것이다.

**고치는 방향** — 클라이언트가 요청마다 만든 UUID를 받아서 저장하고 그 컬럼에 UNIQUE 제약을 건다.
두 번째 요청은 제약에 걸리므로, 그때 새로 만들지 말고 첫 요청이 만든 리소스를 돌려준다.
헤더(`Idempotency-Key`)로 받을지 본문 필드로 받을지는 프론트엔드와 같이 정한다.

**여기까지 안 해도 되는 것** — 게시글·댓글 중복은 1-A(토글)나 1-B(로그아웃)만큼 급하지 않다.
사용자가 중복 글을 눈으로 보고 하나를 지울 수 있기 때문이다. 순서를 정한다면 1-A → 1-B → 1-C 다.

---

### 이미 멱등해서 손댈 필요 없는 것 (코드로 확인함)

| 엔드포인트 | 왜 멱등한가 |
|---|---|
| `POST /api/chat/rooms` (1:1 방) | `pairKey` UNIQUE 제약이 있어 두 번째 요청도 같은 방을 돌려준다 ([ChatController.java:30](../src/main/java/com/example/highteenday_backend/controllers/ChatController.java#L30)) |
| `PATCH /api/chat/rooms/{roomId}/read` | 읽음 위치가 단조 증가한다. 전진하지 않으면 이벤트도 안 나간다 ([ChatService.java:287](../src/main/java/com/example/highteenday_backend/services/domain/ChatService.java#L287)) |
| `PATCH /api/notifications/{id}/read` | 이미 읽음이면 같은 값을 다시 쓴다 ([NotificationService.java:112](../src/main/java/com/example/highteenday_backend/services/domain/NotificationService.java#L112)) |
| `DELETE /api/notifications/{id}` | soft delete라 두 번째 호출도 같은 상태로 끝난다 ([NotificationService.java:130](../src/main/java/com/example/highteenday_backend/services/domain/NotificationService.java#L130)) |
| `DELETE /api/posts/{postId}` | `findById` 가 `isValid = true` 만 조회하므로([PostRepository.java:21](../src/main/java/com/example/highteenday_backend/domain/posts/PostRepository.java#L21)) 두 번째 호출은 404로 끝나고 캐시 카운트 감소([PostService.java:152](../src/main/java/com/example/highteenday_backend/services/domain/PostService.java#L152))까지 가지 않는다 |

**완료 기준** — 1-A의 세 엔드포인트가 `PUT`/`DELETE` 로 갈리고, 같은 요청을 두 번 보내도 DB의
반응·스크랩 상태가 한 번 보냈을 때와 같다는 것을 통합 테스트가 확인한다. 1-B·1-C는 별도 항목으로
쪼개서 진행한다.

### 참고

이 항목의 1-A는 2026-08-14에 KI-54로 처음 기록된 것과 같은 결함이다. 당시 문서는
[localDocs/archive/docs-restructure-2026-09-11/public-legacy-archive/legacy-docs/2026-09-11/defects/KI-54-toggle-non-idempotent.md](archive/docs-restructure-2026-09-11/public-legacy-archive/legacy-docs/2026-09-11/defects/KI-54-toggle-non-idempotent.md)
에 있다. 거기에는 성능 테스트 시더(`performance/datasets/seed.js`)가 이 결함에 데이터를 잃지
않도록 먼저 넣은 방어(`ensureToggled()`)의 설계도 함께 적혀 있다. **그 방어는 시더만 보호한다.**
실사용자와 프론트엔드는 서버를 고쳐야 닫힌다.

---

## 2. 로드밸런서가 보는 헬스 판정에서 Redis를 빼기 — 상태: 저장소 작업 완료, AWS 콘솔만 남음

> 2026-09-22에 아래 1~3·5와 테스트를 적용하고 효과 확인 실험까지 마쳤다.
> 4번(deploy.yml)은 설계대로 바꾸지 않고 그 이유를 해당 줄 위 주석으로 남겼다.
>
> **효과 확인 실행: `redis-crash-2026-09-22T07-33-59`**
>
> | | 기준 `redis-crash-2026-09-11T06-37-20` | 이번 실행 |
> |---|---|---|
> | 폴러가 본 경로 | `/actuator/health` | `/actuator/health/readiness` |
> | 장애 구간 헬스 | 12회 전부 DOWN | **11회 전부 UP** |
> | 같은 구간 HTTP 오류율 | 0 | 0.12% |
>
> 같은 계획으로 Redis 를 60초 멈췄는데 판정이 뒤집혔다. 표본이 12회가 아니라 11회인 것은
> 유실이 아니라 구간 경계 귀속이다. 전체 52건이 5.0초 간격으로 고르게 찍혔고, pre(60초)도
> 11회, post(120초)도 23회로 세 구간 모두 하나씩 적다. 무응답 0건, DOWN 0건이다.
>
> 확인 명령:
>
> ```bash
> cd performance && MSYS_NO_PATHCONV=1 HEALTH_PATH=/actuator/health/readiness \
>   node resilience/fault-run.js resilience/faults/redis-crash.json --note "readiness 분리 후"
> ```
>
> `MSYS_NO_PATHCONV=1` 이 필요하다. Git Bash 가 `/actuator/...` 를 Windows 경로로 바꿔
> `http://localhost:18080C:/Program Files/Git/actuator/...` 를 만든다. 붙여서 확인했다.
>
> **부수 수정 — 헬스 폴러가 멀쩡한 응답을 실패로 기록하고 있었다.**
>
> 첫 실행(`redis-crash-2026-09-22T07-21-15`)에서 표본 51건 중 22건(43%)이
> `timeout after 4000ms` 로 기록됐는데, 그 22건의 실제 소요가 0~2ms 였다. 원인은
> `resilience/lib/http.js` 의 `req.setTimeout` 이 요청 마감이 아니라 소켓 유휴 타임아웃이고,
> Node 기본 agent 가 소켓을 재사용하기 때문이다. 폴링 주기 5,000ms 가 타임아웃 4,000ms 보다
> 1,000ms 길어, 유휴 소켓에서 이전 요청의 타이머가 먼저 터지고 그 소켓을 집은 다음 요청이
> 즉시 실패했다. 요청 단위 타이머 + `agent: false` 로 고쳤고 재실행에서 무응답이 0건이 됐다.
>
> **이 결함은 오늘 이전의 모든 실행에 있었다.** 성공을 실패로 바꿀 뿐 반대는 아니므로 지금까지의
> 결론은 안 바뀌지만, 과거 실행의 "무응답" 표본 수는 액면대로 읽으면 안 된다.
>
> **남은 것 하나.** AWS 콘솔에서 타겟 그룹 헬스체크의 경로를 /actuator/health/readiness 로,
> 포트를 8081 로 바꾼다. 설정 파일만으로는 라우팅 판정이 바뀌지 않는다.

**무엇을** — `/actuator/health` 대신 `/actuator/health/readiness` 를 로드밸런서의 판정 경로로
쓰고, readiness 그룹에는 공유 의존성(DB·Redis)을 넣지 않는다.

### 왜 — 폴백이 막아낸 장애를 헬스체크가 되살린다

`/actuator/health` 는 등록된 인디케이터를 전부 AND 로 묶는다. 이 앱에 자동 등록된 것은 다섯
개다: `db`, `diskSpace`, `ping`, `redis`, `ssl`. 하나라도 DOWN 이면 전체가 DOWN 이고 HTTP 는
503 이다. 코드에 `HealthIndicator` 구현이 하나도 없는데도 붙어 있는 이유는, 스프링 부트가
클래스패스를 보고 자동 등록하기 때문이다(`spring-boot-starter-data-redis` → `RedisHealthIndicator`).

문제는 이 앱이 Redis 없이도 응답한다는 점이다. 목록·개수는 `RedisPostsCache` 가 DB 로 다시
읽고, 인기글은 `daily_hot_post` 테이블로 떨어지고, 리프레시 토큰은 `findByRefreshToken` 으로
간다. 실측 근거는 `performance/resilience/reports/redis-crash-2026-09-11T06-37-20` 이다.
Redis 컨테이너를 60초 정지시킨 구간에서 HTTP 요청 972건의 오류율이 0이었다. 같은 60초 동안
헬스 폴링 12회(5초 간격)는 전부 DOWN 이었다.

그 상태에서 ALB 타겟 그룹 헬스체크가 이 경로를 보고 있으면, 연속 실패 횟수를 넘긴 타겟이
목록에서 빠진다. 모든 인스턴스가 같은 Redis 하나를 보므로 전부 같은 타이밍에 빠진다. 폴백으로
버티던 부분 저하가 전면 장애가 된다.

단서 하나. ALB 는 타겟이 전부 unhealthy 가 되면 상태를 무시하고 모두에게 보낸다(fail-open).
그래서 인스턴스가 한 대뿐이면 트래픽이 끊기지 않을 수도 있다. 다만 ASG·ECS 헬스체크 타입을
ELB 로 잡아 두었다면 unhealthy 판정이 컨테이너 교체를 부른다. 어느 쪽인지는 AWS 콘솔 설정에
달렸고 저장소에 그 설정이 없어 확인하지 못했다.

### Redis 타임아웃 100ms 로는 이게 안 닫힌다

타임아웃을 줄인 변경([application.properties](../src/main/resources/application.properties)의
`spring.data.redis.timeout=100ms`)은 **헬스 응답 속도**를 고쳤지 **상태값**을 고치지 않았다.

| 실행 | Redis 명령 타임아웃 | 헬스 폴링 12회 결과 | 헬스 응답 p50 / p95 | 사용자 요청 fault p95 | 오류율 |
|---|---|---|---|---|---|
| redis-crash-2026-09-11T06-06-22 | 미설정 (Lettuce 기본 60초) | 12회 전부 무응답 | 4,007 / 4,020ms | 60,002.6ms | 31.75% |
| redis-crash-2026-09-11T06-15-49 | 200ms | 12회 전부 DOWN | 267 / 2,010ms | 973.2ms | 0 |
| redis-crash-2026-09-11T06-37-20 | 100ms | 12회 전부 DOWN | 171 / 210ms | 223.8ms | 0 |

세 실행 모두 장애 구간에 UP 이 한 번도 없다. 타임아웃을 줄이면 DOWN 을 **빨리** 말할 뿐이다.

### 어디를

1. [src/main/resources/application.properties](../src/main/resources/application.properties) — Actuator 블록 아래에 두 줄.

   ```properties
   management.endpoint.health.probes.enabled=true
   management.endpoint.health.group.readiness.include=readinessState
   ```

   `probes.enabled` 가 `/actuator/health/readiness` 와 `/liveness` 를 만든다. 쿠버네티스 밖에서는
   이 속성 없이 생기지 않는다. `include` 는 기본값도 `readinessState` 하나지만 명시해 둔다.
   나중에 `db`·`redis` 를 여기 추가하면 위 장애가 그대로 돌아오고, 적혀 있어야 그 변경이 눈에 띈다.

   공유 의존성을 넣지 않는 이유는 스프링 부트 문서가 readiness probe 에 대해 말하는 것과 같다.
   그 하나가 흔들리면 모든 인스턴스가 동시에 빠지는데, 인스턴스를 빼도 공유 의존성은 그대로여서
   우회가 되지 않는다. 의존성 상태가 사라지는 것도 아니다. `/actuator/health` 는 그대로 다섯 개를
   보여 주므로 경보와 사람의 조사는 그쪽을 본다. 라우팅 판정만 옮기는 것이다.

2. [src/main/java/.../security/SecurityConfig.java](../src/main/java/com/example/highteenday_backend/security/SecurityConfig.java) — `securityCustomizer()`
   의 `web.ignoring()` 목록에 `"/actuator/health/**"` 를 추가한다. 지금은 `"/actuator/health"` 정확히
   한 경로만 들어 있다. 같은 파일의 `.requestMatchers("/actuator/**").permitAll()` 덕분에 추가하지
   않아도 접근은 되지만, 그러면 로드밸런서가 수초마다 치는 경로만 인증 필터 체인을 전부 통과한다.

3. [src/main/resources/application-prod.properties](../src/main/resources/application-prod.properties) — ALB 주의 블록(포트 8081 오버라이드를
   지시하는 부분)에 경로 변경도 함께 적는다. 설정만으로는 효과가 없고 **AWS 콘솔에서 타겟 그룹
   헬스체크 경로를 `/actuator/health/readiness` 로, 포트를 8081 로** 바꿔야 실제로 바뀐다.

4. [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) — **바꾸지 않는다.** 배포 게이트는 집계 경로를 그대로 쓴다.
   두 곳의 질문이 다르기 때문이다. ALB 는 "이 인스턴스에 트래픽을 보내도 되나"를 매초 묻고, Redis 가
   없어도 폴백으로 응답하므로 readiness 만 보면 된다. 배포 게이트는 "방금 올린 이미지가 DB·Redis
   설정까지 제대로 잡았나"를 배포 때 한 번 묻는다. `DB_URL` 을 잘못 넣은 이미지는 readiness 로는
   UP 이라 통과하고 실제 요청에서야 전부 실패한다. 대신 배포 시점에 Redis 가 죽어 있으면 게이트가
   앱이 멀쩡해도 롤백하는데, 배포는 사람이 시작하는 일이라 그때 멈추는 쪽을 택한다. 바꾸지 않기로
   한 이유를 그 자리 주석에 남겨야 다음 사람이 "일관성 없다"며 readiness 로 고치지 않는다.

5. [performance/resilience/fault-run.js](../performance/resilience/fault-run.js) — 고친 것을 실험으로 확인하려면 폴러가 찍는 경로를
   바꿀 수 있어야 한다. `HEALTH_PATH` 환경변수를 넣고 기본값은 지금과 같은 `/actuator/health` 로
   둔다(과거 실행과 비교가 깨지지 않는다). `HealthPoller` 생성과 `run.json` 의 `healthUrl` 두 군데가
   같은 값을 쓰게 한다.

   ```bash
   cd performance && HEALTH_PATH=/actuator/health/readiness node resilience/fault-run.js resilience/faults/redis-crash.json --note "readiness 분리 후"
   ```

### 테스트 — 2026-09-11에 작성해 통과시킨 것

`src/test/java/.../configs/HealthGroupTest.java` 로 만들었다. `@SpringBootTest` 에
`spring.data.redis.port=6399`(닫힌 포트)와 `management.endpoint.health.show-details=always` 를
주고, 세 가지를 단언했다.

1. `/actuator/health` 는 503 이고 `$.components.redis.status` 가 `DOWN` 이다
2. 같은 상황에서 `/actuator/health/readiness` 는 200 이고 `$.status` 가 `UP` 이다
3. readiness 응답에 `components.redis` 와 `components.db` 가 없다

3번이 "나중에 공유 의존성을 그룹에 추가하는 변경"을 막는 부분이다. 닫힌 포트를 쓴 이유는 개발
장비에 Redis 가 떠 있어도 판정이 달라지지 않게 하기 위해서다. `./gradlew test` 전체가
BUILD SUCCESSFUL 이었다.

**완료 기준** — 위 1~3, 5가 적용되고 `HealthGroupTest` 가 통과하며, AWS 콘솔의 타겟 그룹
헬스체크 경로·포트가 바뀌어 있다. 확인은 `HEALTH_PATH=/actuator/health/readiness` 로 redis-crash
실험을 한 번 돌려, 장애 구간 헬스 표본 12회가 전부 UP 인 것으로 한다.
