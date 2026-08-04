# BTL-012: 스크랩 토글 체크-후-실행 경쟁 상태 (중복 행 → 게시글 상세 전면 장애로 전파)

> 유형: Correctness / Race Condition (성능이 아니라 가용성 버그 — 부하 테스트 중 실측으로 발견)
> 상태: **확정** (재현 완료 — 실제 중복 행 확인됨)
> 관련: BTL-003(인기글 카운터 경합)과 같은 "동시 쓰기 경합" 계열이지만, 여기서는
> 락 대기가 아니라 **데이터 정합성 깨짐**으로 나타난다

## 증상

같은 사용자가 같은 게시글을 짧은 시간 안에 두 번 스크랩 요청(예: 부하 테스트의
동시 VU, 또는 실사용자가 더블클릭/빠른 재시도)하면 `scraps` 테이블에 **중복 행**이
생기고, 그 이후 해당 게시글의 상세 조회(`GET /api/posts/{id}`)가 항상 500:

```
[500 Internal Server Error] Query did not return a unique result: 2 results were returned
	at com.example.highteenday_backend.services.domain.ScrapService.isScraped(ScrapService.java:35)
```

## 원인

`ScrapService.toggleScrap()`은 체크-후-실행(check-then-act) 패턴이다:

```java
Optional<Scrap> optional = scrapRepository.findByPostAndUser(post, user);
// 있으면 삭제, 없으면 생성 (요약)
```

동시에 같은 (post, user) 조합으로 두 요청이 들어오면 **둘 다 "없음"을 보고 둘 다
새 행을 INSERT**할 수 있다 — DB에 `(USR_id, PST_id)` 유니크 제약이 없어서 이를
막아주지 않는다:

```sql
CREATE TABLE `scraps` (
  `SC_id` bigint ... PRIMARY KEY,
  `PST_id` bigint NOT NULL,
  `USR_id` bigint NOT NULL,
  -- USR_id, PST_id 조합에 대한 UNIQUE 제약 없음
  ...
);
```

실측: 부하 테스트 데이터셋 시드 중(`datasets/seed.js`, 스크랩 40건, 동시성 5) 실제로
`(USR_id=3, PST_id=3)` 조합이 2행 생성된 것을 확인함.

이후 `isScraped()`가 `findByPostAndUser(...).isPresent()`류로 **정확히 0또는1건을
기대하는 쿼리**를 실행하는데, 2건이 있으면 Hibernate가
`NonUniqueResultException`을 던진다. 이 메서드는 게시글 상세 조회
(`GET /api/posts/{id}`) 경로에서 "내가 스크랩했는지" 표시용으로 호출되므로,
**중복이 생긴 게시글은 그 이후 상세 조회 자체가 막힌다** — 스크랩 기능 하나의
경쟁 상태가 완전히 무관한 조회 기능(게시글 상세)까지 전면 장애로 전파시킨다.

## 영향

- 동시 스크랩 요청이 있는 모든 상황(부하 테스트, 실사용자의 더블클릭/빠른 재탭)에서
  발생 가능
- 한 번 중복 행이 생기면 **그 게시글은 영구적으로 상세 조회 불가** (데이터가
  정리되기 전까지) — 조회수 축적이 큰 인기글일수록 먼저 오염되고, 그만큼 파급력이 큼
- `reactions`(BTL-003)와 달리 이건 락 경합이 아니라 데이터 정합성 자체가 깨지는
  문제라 더 심각하다 — 재시도로 해결되지 않고 수동 데이터 정리가 필요하다

## 재현 방법

```bash
# 동시성이 있는 스크랩 부하만으로 재현
k6 run scripts/scraps.js -e VUS=20 -e DURATION=30s -e DATASET=medium -e BASE_URL=http://localhost:18080
# 또는 시드 스크립트로도 재현됨 (동시성 5로도 발생 확인)
node datasets/seed.js --profile smoke --base http://localhost:18080 --concurrency 5
```

확인 SQL:
```sql
SELECT USR_id, PST_id, COUNT(*) c FROM scraps GROUP BY USR_id, PST_id HAVING c > 1;
```

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| `scraps`에 `UNIQUE(USR_id, PST_id)` 추가 | 중복 생성 자체를 DB 레벨에서 차단(근본 해결) | 기존에 이미 생긴 중복 행을 먼저 정리(하나만 남기고 삭제)해야 제약 추가가 가능 |
| `toggleScrap`을 `INSERT ... ON DUPLICATE KEY` 또는 비관적 락으로 재작성 | 경쟁 상태 자체 제거 | 위 유니크 제약이 선행되어야 의미 있음 |
| `isScraped()`를 `findFirstByPostAndUser` + limit 1로 방어적으로 변경 | 상세 조회 장애만 즉시 완화(증상 치료) | 근본 원인(중복 데이터)은 그대로 남음 — 임시 조치로만 사용 |

**권장 순서**: 기존 중복 행 정리 → 유니크 제약 추가 → `toggleScrap` 원자화.
`isScraped()` 방어적 수정은 근본 수정 전 임시 완화책으로만.
