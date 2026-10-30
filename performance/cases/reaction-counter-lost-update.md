# 동시 반응의 카운터 어긋남

> 상태: 조사 중. 카운터와 실제 행 수의 어긋남을 관측했고, 후보 경로 두 개를 코드에서 찾았지만 어느 경로인지 가리지 못했다. 재현 테스트는 아직 없다.
> 영향도: 중간. 장애 주입 전 표본에서도 나와 장애와 무관하게 생길 수 있고, 같은 게시글에 다음 반응이 올 때까지 남는다.
> 실행: `counter-drift` 표본이 있는 장애 실험 실행 25건(어긋남이 나온 10건은 아래 표)

## 요약

`counter-drift` 불변식은 `posts.PST_like_count`의 합과 `posts_reactions`의 유효 행 수를 같은
스냅샷에서 비교한다. 표본이 있는 실행 25건 중 10건에서 어긋남이 나왔다. 4건은 실행 중 새로 생긴
어긋남이 끝까지 남았고, 5건은 중간 표본에만 나타났다가 사라졌으며, 1건은 시작 전부터 있던 값이
그대로였다. 장애 주입 전 표본(S1)에서도 나오므로 장애와 무관하게 생길 수 있다. 원인 후보는 반응
쓰기 때의 재집계 경합과 조회수 반영의 행 전체 덮어쓰기 두 가지이고, 어느 쪽인지는 가리지 못했다.

## 문제와 영향

표의 값은 각 표본에서 카운터 합 − 유효 행 수다. 양수는 카운터가 행보다 많다는 뜻이다. S0은 실행
시작 전, S1은 장애 주입 직전, S2는 장애 해제 직후, S3은 실행 끝이다. 표는 어긋남이 한 번이라도
나온 10건 전부다.

| 실행 | 도착률 | 좋아요 S0 → S1 → S2 → S3 | 싫어요 S0 → S1 → S2 → S3 | 읽는 법 |
|---|---:|---|---|---|
| [`mysql-slow-2026-09-21T00-05-32`](../resilience/reports/mysql-slow-2026-09-21T00-05-32/run.json) | 4/s | +1 → 0 → −1 → 0 | 0 → 0 → +1 → 0 | 중간 표본에만 나타났다가 회복 |
| [`mysql-crash-2026-09-22T07-57-12`](../resilience/reports/mysql-crash-2026-09-22T07-57-12/run.json) | 4/s | 0 → 0 → 0 → −1 | −1 → −1 → −1 → −1 | 좋아요에 새 어긋남이 끝까지 남음 |
| [`mysql-freeze-2026-09-22T08-19-21`](../resilience/reports/mysql-freeze-2026-09-22T08-19-21/run.json) | 4/s | 0 → 0 → 0 → 0 | −1 → −1 → −1 → −1 | 시작 전부터 있던 −1만 그대로 |
| [`mysql-freeze-2026-09-22T08-33-55`](../resilience/reports/mysql-freeze-2026-09-22T08-33-55/run.json) | 60/s | +1 → +1 → +1 → +2 | −1 → 0 → −1 → 0 | 좋아요에 새 어긋남 +1이 끝까지 남음 |
| [`redis-crash-2026-09-14T05-22-34`](../resilience/reports/redis-crash-2026-09-14T05-22-34/run.json) | 60/s | 0 → +1 → +1 → 0 | −1 → −1 → −1 → −1 | 좋아요는 중간에만, 싫어요는 시작 전 값 그대로 |
| [`redis-crash-2026-09-17T06-14-24`](../resilience/reports/redis-crash-2026-09-17T06-14-24/run.json) | 60/s | 0 → 0 → 0 → 0 | 0 → 0 → −1 → −1 | 싫어요에 새 어긋남이 끝까지 남음 |
| [`redis-crash-2026-09-17T07-14-13`](../resilience/reports/redis-crash-2026-09-17T07-14-13/run.json) | 60/s | 0 → 0 → 0 → 0 | −1 → −1 → −1 → +1 | 싫어요가 −1에서 +1로 바뀐 채 끝남 |
| [`redis-crash-2026-09-22T07-21-15`](../resilience/reports/redis-crash-2026-09-22T07-21-15/run.json) | 60/s | 0 → −1 → 0 → 0 | 0 → +1 → 0 → 0 | 장애 주입 전(S1)에 생겼다가 회복 |
| [`redis-crash-2026-09-22T07-33-59`](../resilience/reports/redis-crash-2026-09-22T07-33-59/run.json) | 60/s | 0 → −1 → 0 → 0 | −4 → −3 → −1 → −1 | 좋아요는 중간에만, 싫어요는 시작 전 −4가 −1로 줄어듦 |
| [`redis-crash-breakpoint-2026-09-17T01-30-55`](../resilience/reports/redis-crash-breakpoint-2026-09-17T01-30-55/run.json) | 40/s | +1 → 0 → +3 → 0 | −1 → 0 → −1 → 0 | 중간 표본에만 나타났다가 회복 |

나머지 15건(`mysql-crash-2026-09-21T01-30-04`, `mysql-hang` 2건, `mysql-slow-2026-09-21T04-33-28`,
2026-09-10~14의 도착률 4/s `redis-crash` 9건, `redis-hang-2026-09-14T00-00-27`,
`redis-slow-2026-09-14T00-14-46`)은 네 표본 모두 0이었다. 도착률 40/s 이상 실행은 7건 모두에서
어긋남이 나왔고, 4/s 실행은 18건 중 3건이었다.

값은 각 run.json의 `integrity.samples[].values`에서 `sumLike − rowsLike`, `sumDislike − rowsDislike`로
계산했다. 실행 시작 전(S0)에 이미 어긋남이 있는 실행이 8건이라, 데이터셋 복원 시점이나 직전
실행에서 남은 어긋남이 섞여 있다. 그래서 S3 − S0 증가분만으로 읽지 않고 표본 네 개를 함께 본다.

사용자가 보는 것은 게시글의 좋아요 수다. 실제로 누른 사람 수와 화면에 뜨는 수가 달라진다. 표의
값은 전체 게시글 합계의 차이(−4~+3)라 게시글별 크기는 알 수 없다. 어긋남은 알림 없이 남고, 다음
반응이 같은 게시글에 도착하면 `syncCounts`가 전체를 다시 세어 덮어쓰므로 그때 맞춰진다. 반응이 뜸한
게시글일수록 틀린 값이 오래 남는다.

## 원인과 확신도

[`PostReactionStore.recount`](../../src/main/java/com/example/highteenday_backend/domain/posts/PostReactionStore.java)가
행을 센 뒤 그 값을 카운터에 덮어쓴다.

```java
int likes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, ReactionKind.LIKE);
int dislikes = postReactionRepository.countByPostAndKindAndIsValidTrue(post, ReactionKind.DISLIKE);
post.syncReactionCounts(likes, dislikes);
```

`ReactionService`의 쓰기 메서드가 `@Transactional`이고 그 안에서 불린다. MySQL 기본
격리 수준 REPEATABLE READ에서 같은 게시글에 동시 요청이 오면 서로의 미커밋 변경을
못 본다.

양방향으로 어긋나는 것이 이 설명과 맞는다. 유효 행이 N개인 상태에서 A의 추가와 B의
취소가 겹치면,

- T1(추가): 자기 INSERT만 보고 세어 N+1을 쓴다
- T2(취소): 자기 취소만 보고 세어 N−1을 쓴다
- 둘 다 커밋하면 실제 행은 N인데 카운터는 나중에 커밋한 쪽의 값이 남는다

T1이 나중이면 +1, T2가 나중이면 −1이다. 읽고 나서 쓰는 사이에 다른 트랜잭션이
끼어들어 한쪽 갱신이 사라지는 모양이고, 이 저장소에서 락이나 원자적 증감을 쓰지
않는다.

이 문서는 그 경합을 증명하지 않는다. 코드가 그 모양이고 관측이 그 모양에서 나올 수
있다는 것까지다. 실제로 그 경로를 밟았는지는 확인하지 않았다. 같은 게시글에 동시
요청이 실제로 몇 번 겹쳤는지, 겹친 시점의 격리 수준이 무엇이었는지 재지 않았다.

같은 어긋남을 만드는 다른 후보 경로가 있다. 조회수 반영(`PostService.applyViewCount`)은
`Post`를 읽고 조회수만 바꾼 뒤 행 전체를 쓴다. `Post`에 `@DynamicUpdate`가 없기 때문이다.
읽은 뒤 쓰기 전에 반응 추가가 커밋되면 좋아요 수가 −1, 취소가 커밋되면 +1로 남는다. 이
경로는 [반응 쓰기의 재집계와 행 덮어쓰기 사례](reaction-write-recount-and-row-overwrite.md)가
다룬다. 관측된 어긋남이 어느 경로에서 나왔는지는 가리지 못한다.

## 조치와 검증

재현이 먼저다. 같은 게시글에 서로 다른 사용자의 반응을 동시에 보내는 테스트를
쓴다. 실제 DB(`@DataJpaTest` 또는 테스트 컨테이너)를 써야 한다. repository mock으로는
격리 수준이 재현되지 않는다.

고치는 방법 두 가지를 비교하고 고른 이유를 적는다.

- 비관적 락: 게시글 행을 `@Lock(LockModeType.PESSIMISTIC_WRITE)`로 잡고 센다.
  변경량이 작지만 같은 게시글의 반응이 직렬화된다.
- 원자적 증감: `UPDATE posts SET PST_like_count = PST_like_count + 1 WHERE ...`로
  바꾼다. 락이 필요 없지만 취소·전환 경로에서 부호를 정확히 맞춰야 하고, 한 번
  어긋나면 스스로 회복하지 못한다. 지금 방식은 다음 반응이 전체를 다시 세므로
  회복하는 성질이 있다.

[`CommentReactionStore.recount`](../../src/main/java/com/example/highteenday_backend/domain/comments/CommentReactionStore.java)에
같은 재집계 패턴이 있다. 같은 문제인지 확인하고 함께 고친다.

검증 기준은 `counter-drift` 불변식이다. 고친 뒤 도착률 60/s 실행에서 S0부터 S3까지 모든 표본의
차이가 S0의 값보다 커지지 않으면 해소로 본다. 실행 전에 S0 차이를 0으로 맞추면 판정이 단순해진다.

## 남은 위험

상시 운영을 켜기 전에 고쳐야 하는 항목이다. 이 상태로 상시 트래픽을 돌리면 어긋난
카운터가 계속 새로 생기고, 그 위에서 뽑은 반응 수치를 믿기 어렵다.

멱등화로는 해소되지 않는다. 멱등성은 같은 요청을 두 번 보냈을 때 최종 상태가
같다는 계약이고, 이 결함은 서로 다른 요청 둘이 동시에 왔을 때 한쪽 갱신이 사라지는
것이다. 두 작업을 별개로 잡아야 한다.

측정 환경에서 확인한 값이고 운영 환경의 발생률은 모른다. 실제 사용자의 동시 반응
빈도가 부하 모델과 다르면 크기가 달라진다.

## 근거

- 실행 10건의 run.json: 위 표의 실행 ID 링크. 나머지 15건은 같은 폴더의 실행 원자료. 스냅샷 시점 정의는
  [integrity.js](../resilience/lib/integrity.js)
- 관련 코드: [`PostReactionStore`](../../src/main/java/com/example/highteenday_backend/domain/posts/PostReactionStore.java),
  [`ReactionService`](../../src/main/java/com/example/highteenday_backend/services/domain/ReactionService.java),
  [`CommentReactionStore`](../../src/main/java/com/example/highteenday_backend/domain/comments/CommentReactionStore.java)
