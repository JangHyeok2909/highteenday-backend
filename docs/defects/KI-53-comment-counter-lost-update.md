# KI-53: 댓글 수 카운터가 동시 쓰기에서 유실됨

> 목록 항목: [KNOWN-ISSUES.md · KI-53](../KNOWN-ISSUES.md#ki-53-댓글-수-카운터가-동시-쓰기에서-유실됨)
> 상태: **미해결**
> 발견: 2026-08-14, 성능 테스트용 `large` 데이터셋 검증 중
> 관련: [BTL-003](../../performance/bottlenecks/BTL-003-hot-row-counter.md)(같은 코드, 다른 문제 — 아래 참고)

## 쉽게 말하면

게시글에 댓글이 100개 달렸는데 목록에는 "댓글 90"이라고 표시된다. 댓글을 열면 100개가
다 나온다. **저장된 숫자와 실제 개수가 다르다.**

## 증상

`posts.PST_comment_count`(빠른 조회용 비정규화 카운터)가 실제 `comments` 행 수보다 적다.
요청은 전부 200으로 성공하고 아무것도 죽지 않는다. **조용히 숫자만 틀린다.**

## 실측 근거

`large` 데이터셋의 MySQL을 직접 조회했다 (2026-08-14).

```sql
SELECT
  (SELECT SUM(PST_comment_count) FROM posts WHERE is_valid=1) AS stored_sum,
  (SELECT COUNT(*) FROM comments c JOIN posts p ON c.PST_id=p.PST_id
   WHERE c.is_valid=1 AND p.is_valid=1) AS actual_sum;
```

| 저장된 합 | 실제 댓글 수 | 차이 |
|---:|---:|---:|
| 386,672 | 399,956 | **-13,284** (약 3.3%) |

불일치가 발생한 게시글은 100,000건 중 **70건**이다. 결정적인 것은 **방향**이다.

```sql
SELECT SUM(CASE WHEN c_stored < c_actual THEN 1 ELSE 0 END) AS under_cnt,
       SUM(CASE WHEN c_stored > c_actual THEN 1 ELSE 0 END) AS over_cnt,
       MIN(c_stored - c_actual) AS min_diff
FROM (SELECT p.PST_comment_count AS c_stored, COUNT(c.CMT_id) AS c_actual FROM posts p
      LEFT JOIN comments c ON c.PST_id = p.PST_id AND c.is_valid = 1 WHERE p.is_valid = 1
      GROUP BY p.PST_id, p.PST_comment_count) x
WHERE c_stored <> c_actual;
```

| 적게 셈 | 많이 셈 | 단일 게시글 최대 손실 |
|---:|---:|---:|
| 70건 | **0건** | 11,096 (게시글 ID 3) |

**70건 전부가 실제보다 적게 세어져 있고, 많이 센 경우는 하나도 없다.** 무작위 오류라면
양방향으로 나와야 한다. 한 방향으로만 쏠린다는 것은 **증가분이 유실된다**는 뜻이다.

> `PST_comment_count`처럼 컬럼 별칭에 `stored`를 쓰면 MySQL 8에서 예약어 오류가 난다
> (생성 컬럼의 `STORED`). 위 쿼리가 `c_stored`를 쓰는 이유다.

## 원인

`Post.incrementCommentCount()`(`domain/posts/Post.java:103`)가 JVM 메모리 위에서
읽고-더하고-쓴다.

```java
public void incrementCommentCount() {
    this.commentCount++;          // 읽기 → +1 → 쓰기
}
```

`CommentService.createComment()`(`services/domain/CommentService.java:55`)가 이걸 호출하고,
JPA가 트랜잭션 종료 시점에 `UPDATE posts SET PST_comment_count = ?`로 내보낸다.

두 요청이 같은 게시글에 동시에 댓글을 달면:

```text
트랜잭션 A: posts 조회 → commentCount = 100
트랜잭션 B: posts 조회 → commentCount = 100      (A가 아직 커밋 안 함)
트랜잭션 A: 101로 UPDATE, 커밋
트랜잭션 B: 101로 UPDATE, 커밋                    ← A의 증가분이 사라짐
```

댓글 행은 둘 다 INSERT되므로 **실제 댓글은 2개 늘고 카운터는 1만 는다.** 교과서적인
갱신 유실(lost update)이다.

`Post` 엔티티에 `@Version`이 없어 낙관적 락도 걸리지 않는다. 충돌이 예외로 드러나지 않고
**조용히 지나간다.**

## 같은 코드베이스 안에 정답이 이미 있다

스크랩과 반응 카운터는 **다른 방식**을 쓴다.

```java
// ScrapService.java:69 — DB에서 다시 센 값을 대입한다
post.syncScrapCount(Math.toIntExact(scrapRepository.countValidByPost(post)));
```

증감이 아니라 **재계산 후 대입**이다. 앞선 유실이 있었더라도 다음 요청이 바로잡는다.
자가 치유된다.

같은 DB에서 세 카운터의 불일치를 재면 차이가 드러난다.

| 카운터 | 갱신 방식 | 불일치 게시글 |
|---|---|---:|
| 댓글 (`PST_comment_count`) | `++` / `--` (메모리 증감) | **70건** |
| 스크랩 (`PST_scrap_count`) | DB 재계산 후 대입 | **0건** |
| 좋아요 (`PST_like_count`) | DB 재계산 후 대입 | 3건 |

**스크랩은 0건이다.** 같은 부하, 같은 동시성, 같은 시더로 만들어졌는데 갱신 방식만 다르다.
이 대조가 원인을 거의 확정해 준다.

좋아요가 3건 남은 이유는 재계산에도 좁은 창이 있기 때문이다.
`PostReactionService.syncCounts()`가 세는 시점은 자기 트랜잭션 안이라, 동시에 커밋 중인
다른 트랜잭션의 행은 REPEATABLE READ 격리에서 보이지 않는다. `++`보다 창이 훨씬 좁지만
0은 아니다.

## 영향

- **사용자**: 게시글 목록의 댓글 수가 실제보다 적게 보인다. 상세로 들어가면 다 보인다.
- **인기글 정렬**: `HotScoreCalculator`(`utils/HotScoreCalculator.java:23`)가
  `commentCount`에 가중치를 곱해 인기 점수를 만든다. **카운터가 낮으면 인기글 순위가
  실제보다 낮게 잡힌다.** 댓글이 많이 달린 글일수록 동시 쓰기가 많아 더 많이 유실되므로,
  **가장 인기 있는 글이 가장 많이 손해를 본다.** 단일 게시글 최대 손실이 11,096(ID 3)인
  것이 이 방향과 맞는다.
- **성능 실험**: 데이터셋 검증에서 "카운터 == 실제 개수"를 조건으로 걸면 현재 상태는 실패다.

## 재현 방법

부하 없이는 재현되지 않는다. 같은 게시글에 동시 요청을 넣어야 한다.

```bash
# performance/ 에서 — 쓰기 저니가 인기글에 댓글을 몰아 넣는다
node tools/perf-run.js scripts/comments.js --vus 20 --duration 60s --dataset small
```

실행 전후로 위 검증 SQL을 돌려 불일치 건수가 늘어나는지 본다.

## 해결 방법 후보

| 방법 | 장점 | 단점 |
|---|---|---|
| **① DB 원자 증감** — `UPDATE posts SET PST_comment_count = PST_comment_count + 1 WHERE PST_id = ?` | 유실이 원리적으로 불가능. 재계산보다 가볍다 | JPA 더티체킹을 벗어나므로 영속성 컨텍스트와 값이 어긋날 수 있다 |
| **② 재계산 후 대입** (스크랩 방식) | 코드베이스에 이미 있는 패턴. 자가 치유 | 매 요청 `COUNT(*)` 추가. 댓글 많은 글에서 비싸다. 창이 좁아질 뿐 0은 아니다(좋아요 3건) |
| **③ `@Version` 낙관적 락** | 충돌이 예외로 드러난다 | 실패한 요청을 재시도해야 한다. 인기글에서 충돌률이 높아진다 |
| **④ 비정규화 폐기** | 정합성 문제 자체가 사라진다 | 목록 조회마다 `COUNT(*)` — 이 프로젝트가 비정규화를 택한 이유와 정면 충돌 |

**권고는 ①이다.** 유실을 확률적으로 줄이는 게 아니라 없애고, 추가 쿼리도 없다.
`commentCount` 필드를 읽는 쪽은 그대로 두고 쓰는 경로만 바꾼다.

다만 ①을 적용해도 **이미 어긋난 70건은 그대로다.** 일회성 보정 쿼리 또는 데이터셋
재생성으로 해소해야 한다. 어느 쪽을 쓸지는 아직 결정하지 않았다.

## BTL-003과 혼동하지 말 것

[BTL-003](../../performance/bottlenecks/BTL-003-hot-row-counter.md)(인기글 비정규화 카운터
단일 row 락 경합)은 **같은 줄의 코드가 원인이지만 다른 문제**다.

| | BTL-003 | KI-53 (이 문서) |
|---|---|---|
| 무엇이 나쁜가 | 락 대기로 **느려진다** | 숫자가 **틀린다** |
| 분류 | 성능 병목 | 정합성 결함 |

①(원자 증감)을 적용하면 KI-53은 해결되지만 BTL-003의 락 경합은 **그대로이거나 늘 수 있다** —
같은 행을 계속 UPDATE하는 것은 변함없기 때문이다. 두 항목은 따로 판단해야 한다.

## 확인된 사실과 추론

**실측으로 확인한 것**

- 불일치 수치 전부 (386,672 / 399,956 / 70건 / 전부 과소 / 최대 11,096) — 2026-08-14 직접 조회
- 스크랩 0건, 좋아요 3건 — 같은 조회
- `Post`에 `@Version`이 없다는 것 — 소스 확인
- 댓글은 증감, 스크랩·반응은 재계산이라는 갱신 방식 차이 — 소스 확인

**추론인 것** (별도 검증 필요)

- 원인이 갱신 유실이라는 것 — 방향이 한쪽으로만 쏠린 것과 갱신 방식 대조가 강한 근거지만,
  동시 요청을 의도적으로 만들어 재현하지는 않았다
- 인기글 순위가 실제보다 낮게 잡힌다는 것 — `HotScoreCalculator`가 `commentCount`를 쓰는
  것은 사실이나, 순위가 실제로 얼마나 뒤집히는지는 재지 않았다
