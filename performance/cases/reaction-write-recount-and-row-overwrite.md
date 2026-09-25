# 반응 쓰기가 요청마다 전체를 다시 세고 게시글 행 전체를 덮어쓰는 사례

> 상태: open — 코드 판독으로 확인, 재현 테스트와 원인별 측정은 하지 않음
> 영향도: medium — 같은 글에서 동시에 일어난 댓글 수 증가·글 수정·조회수 반영을 반응 하나가
> 되돌릴 수 있고, 반응 한 번의 비용이 그 글의 반응 수에 비례한다
> 발견: 2026-09-24 코드 검토
> 기준 코드: 커밋 `652a031` (아래 클래스·메서드 이름은 이 커밋 기준)
> 관련 실행: `normal-day-2026-09-11T04-34-36` (medium, 커밋 `c658d315`)

## 요약

게시글 좋아요 한 번에 DB 문장이 10개 나간다. 그중 4개는 요청이 스스로 정하는 "내 반응"을
다시 묻는 조회이고, 2개는 그 글의 유효 반응 행을 전부 다시 세는 `COUNT`다. 재집계 비용은
글에 붙은 반응 수에 비례하므로, 반응이 몰리는 인기글에서 가장 비싸다.

**카운터를 반영하는 방식이 더 큰 문제다.** 반응 서비스는 센 값을 `Post` 엔티티에 넣고 dirty
checking으로 저장한다. `Post`에 `@DynamicUpdate`가 없어 이 UPDATE는 제목·본문·댓글 수·조회수까지
모든 컬럼을 쓰는데, 그 값은 요청이 시작될 때 읽은 것이다. 반응 요청이 처리되는 사이에 다른
요청이 같은 글의 다른 컬럼을 바꾸면 그 변경이 되돌려진다. 댓글 반응과 `Comment`도 같은 구조다.

## 재현 조건과 사용자 영향

**문장 수.** 처음 누르는 게시글 좋아요(`POST /api/posts/{postId}/reaction?type=LIKE`)를 코드로
따라가며 센 값이다. 실측이 아니다. 요청별 쿼리 수 지표(`app.query-metrics`)는 이 실행의
원자료에 엔드포인트별로 남아 있지 않다.

| # | 문장 | 위치 | 성격 |
|---|---|---|---|
| 1 | `PostRepository.findById` (JPQL) | `PostReactionController.react` | 대상 조회 |
| 2–3 | 유효 LIKE·DISLIKE 존재 확인 | `PostReactionService.likeReact` | 내 반응 조회 |
| 4 | `upsertKind` | `PostReactionService.createReaction` | 쓰기 |
| 5–6 | 유효 LIKE·DISLIKE `COUNT` | `PostReactionService.syncCounts` | 재집계 |
| 7 | `UPDATE posts` (모든 컬럼) | 커밋 시 flush | 쓰기 |
| 8 | `PostRepository.findById` (JPQL) | `HotPostEventListener` → `HotPostService.updateLeaderboardDayScore` | 인기 점수 |
| 9–10 | 유효 LIKE·DISLIKE 존재 확인 | `PostReactionService.getLikeSatateDto` | 내 반응 조회 |

8번은 `AFTER_COMMIT` 리스너라 커밋 직후, 컨트롤러가 응답을 만들기 전에 나간다.
`PostRepository.findById`는 `@Query`로 재정의돼 있어 같은 영속성 컨텍스트에 엔티티가 있어도
SELECT가 다시 나간다.

**지연.** 같은 실행에서 k6가 잰 응답 시간이다. 원인별로 나누어 재지는 않았다.

| 엔드포인트 | 요청 수 | 중앙값 | p95 |
|---|---:|---:|---:|
| `post_reaction` | 594 | 25.6ms | 121.4ms |
| `comment_reaction` | 216 | 21.7ms | 57.9ms |
| `post_detail` | 12,795 | 6.4ms | 51.1ms |

이 실행에서 `post_reaction`은 p95 기준으로 로그인, 검색, 댓글 작성 다음으로 느리다.

**덮어쓰기로 사용자가 겪는 일.** 반응 요청 하나가 처리되는 동안 같은 글에 아래 일이 겹치면
그 결과가 사라진다.

- **댓글 작성:** `PostRepository.incrementCommentCount`가 원자적으로 올린 댓글 수가 반응
  요청이 읽어 둔 값으로 돌아간다. 화면의 댓글 수가 실제보다 적게 남는다.
- **글 수정:** 작성자가 고친 제목과 본문이 수정 전으로 돌아간다. 댓글 좋아요도 같은 방식으로
  댓글 본문 수정을 되돌린다.
- **조회수 반영:** `ViewCountScheduler`가 반영한 증가분이 사라진다.

겹칠 수 있는 시간 폭은 반응 요청이 대상 엔티티를 읽은 때부터 커밋할 때까지다. 위 실행의 k6
응답 시간(중앙값 25.6ms)보다 짧거나 같다. 실제로 겹친 횟수는 재지 않았다.

## 원인 분석과 확신도

**재집계.** `PostReactionService.syncCounts`가
쓰기 뒤마다 유효 LIKE와 DISLIKE를 각각 센다. `posts_reactions`의 인덱스는 V1 migration의
`uk_posts_reactions_pst_usr (PST_id, USR_id)`와 FK 인덱스뿐이다. `PST_id`로 그 글의 행까지는
좁히지만 `PST_RCT_kind`와 `is_valid`가 인덱스에 없어, 행마다 클러스터 인덱스를 다시 읽어야
조건을 판정한다. `EXPLAIN`으로 확인하지는 않았다. `CommentReactionService.syncCounts`도 같은
구조다.

**전체 행 덮어쓰기.** 세 가지가 겹쳐 생긴다.

1. `Post`와 `Comment`에 `@DynamicUpdate`가 없다. 이 경우 Hibernate는 어느 컬럼이 바뀌었든
   매핑된 컬럼 전부를 UPDATE한다.
2. `src/main/resources` 아래 어느 설정 파일도 `spring.jpa.open-in-view`를 지정하지 않아 기본값
   true로 동작한다. 컨트롤러가 트랜잭션 밖에서 `postService.findById`로 읽은 `Post`가 요청이
   끝날 때까지 영속 상태로 남는다.
3. `likeReact`는 그 엔티티를 받아 `Post.syncReactionCounts`로 카운터만 바꾼다. 커밋할 때 flush가
   이 엔티티의 모든 컬럼을 컨트롤러가 읽은 시점의 값으로 쓴다.

[`PostRepository.incrementCommentCount`](../../src/main/java/com/example/highteenday_backend/domain/posts/PostRepository.java)의
Javadoc은 `commentCount++`의 읽고-더하고-쓰기가 증가분을 덮어써 large 실측에서 13,284건이
비었던 문제를 원자적 UPDATE로 막았다고 적는다. 반응 경로가 같은 컬럼을 다른 쪽에서 다시
덮어쓴다.

**같은 모양의 경로가 둘 더 있다.**

- `PostService.applyViewCount`는 `Post`를 읽고 `addViewCount`로 조회수만 바꾼 뒤 행 전체를 쓴다.
  그 사이에 커밋된 반응의 좋아요 수를 읽은 시점 값으로 되돌릴 수 있다. 이 트랜잭션 하나만
  위험 구간이라 반응 경로보다 짧다.
- `ScrapService`가 `Post.syncScrapCount`로 스크랩 수를 같은 방식으로 반영한다.

**확신도: 코드 사실은 높고, 발생 빈도는 모른다.** `@DynamicUpdate` 부재, open-in-view 기본값,
엔티티를 통한 카운터 동기화는 코드와 설정에서 확인했다. 두 요청이 실제로 겹쳐 값이 되돌려진
사례는 관측하지 않았고 재현 테스트도 없다.

[동시 반응의 카운터 어긋남](reaction-counter-lost-update.md)에서 관측된 양방향 어긋남은 조회수
반영 경로로도 나온다. 조회수 반영이 좋아요 수를 읽은 뒤 쓰기 전에 반응 추가가 커밋되면 −1,
취소가 커밋되면 +1이다. 관측이 어느 경로에서 나왔는지는 가리지 못한다.

## 조치와 검증 계획

**멱등 전환으로는 해소되지 않는다.** [응답 유실 재시도 사례](retry-after-lost-response.md)의
PUT·DELETE 전환은 재집계를 `PostReactionStore.recount`·`CommentReactionStore.recount`로 옮기지만,
센 값을 엔티티로 쓰는 방식은 그대로다. 달라지는 것은 덮어쓰기 창이다. 전환 설계에서는 대상
엔티티를 컨트롤러가 아니라 서비스 트랜잭션 안(`requireExists`)에서 읽으므로, 창이 요청 전체에서
트랜잭션 구간으로 줄어든다.

제안은 셋이고, 변경이 작은 순서로 적었다.

1. **`Post`·`Comment`에 `@DynamicUpdate`.** 반응 경로는 카운터 컬럼만, 조회수 반영은 조회수만
   쓰게 되어 다른 컬럼을 되돌리는 문제가 사라진다. 같은 컬럼끼리의 경합, 즉 재집계의 카운터
   어긋남은 남는다.
2. **대상 행 잠금 + 상태 전이 증감.** 반응 쓰기의 첫 문장에서 대상 행을 `SELECT ... FOR UPDATE`로
   잠그고, 내 이전 반응을 읽어 목표 상태와의 차이만 원자적 UPDATE로 더한다.

   | 이전 → 목표 | 좋아요 | 싫어요 |
   |---|---:|---:|
   | 없음 → LIKE | +1 | 0 |
   | DISLIKE → LIKE | +1 | −1 |
   | LIKE → LIKE | 0 | 0 |
   | LIKE → 없음 | −1 | 0 |

   `COUNT`가 없어져 비용이 반응 수와 무관해진다. 카운터를 엔티티로 쓰지 않으므로 1번 없이도
   반응 경로의 덮어쓰기가 사라지고, [카운터 어긋남 사례](reaction-counter-lost-update.md)의
   경합도 함께 닫힌다. 대가는 셋이다.
   - 같은 글의 반응이 잠금에서 줄을 선다.
   - 한 번 어긋난 카운터가 저절로 맞춰지지 않는다. 지금은 다음 반응이 전체를 다시 세어 맞춘다.
   - 이미 어긋난 카운터를 처리해야 한다. 재집계 migration을 넣으면 성능 데이터셋의 상태
     지문(`posts.sumLikeCount`, `posts.sumDislikeCount`)이 바뀌어 이전 실행과 비교할 수 없다.
3. **게시글 상세의 존재 확인 2회를 `kind` 조회 1회로.** 같은 행을 LIKE인지 DISLIKE인지 따로 묻고 있다.

**검증 계획.**

- **재현 테스트를 먼저 쓴다.** 한 트랜잭션이 엔티티를 읽은 뒤 다른 트랜잭션이 댓글 수나 본문을
  바꾸고 커밋하게 만든 다음, 첫 트랜잭션을 커밋해 값이 되돌려지는지 본다. 격리 수준과 잠금이
  핵심이라 H2가 아닌 실제 MySQL(Testcontainers)에서 돌린다.
- **2번을 넣으면 Before/After를 잰다.** `performance/scripts/reactions.js`가 PUT으로 바뀌면서 부하
  모델이 달라졌으므로, 그 뒤의 normal-day 실행을 Before 기준선으로 삼는다. `post_reaction` p95와
  요청당 쿼리 수를 보고, fault 실행에서 `counter-drift` 증가분 차이가 0인지 확인한다.

## 남은 위험과 근거

**측정하지 않은 것이 둘이다.** `post_reaction` 지연 가운데 재집계가 차지하는 비중, 그리고
운영 트래픽에서 반응과 다른 쓰기가 같은 글에서 겹치는 빈도다.

**근거.**

- 문장 수: `PostReactionController.react`, `PostReactionService`의 `likeReact`·`createReaction`·
  `syncCounts`·`getLikeSatateDto`, `HotPostEventListener.onPostReacted`,
  `HotPostService.updateLeaderboardDayScore`, `PostRepository.findById`의 `@Query` 재정의
- 전체 행 쓰기: `Post`·`Comment` 엔티티 선언, `Post.syncReactionCounts`, `Comment.syncReactionCounts`,
  `src/main/resources`에 `open-in-view` 설정 없음
- 같은 모양의 경로: `PostService.applyViewCount`, `ScrapService`의 `syncScrapCount` 호출
- 인덱스: `src/main/resources/db/migration/V1__baseline.sql`의 `uk_posts_reactions_pst_usr`,
  `uk_comments_reactions_cmt_usr`
- 지연: `performance/reports/runs/normal-day-2026-09-11T04-34-36/run.json`의 `k6.breakdown.name`
