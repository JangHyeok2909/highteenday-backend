# BTL-001: 게시글 목록 랜덤/OFFSET 페이징

> 유형: DB / Query / Index
> 상태: 의심
> 관련: (실험 미배정 — EXP-001 결과에서 post_list P95가 SLO 초과 시 승격)

## 증상

게시글이 수만 건으로 늘수록 `GET /api/boards/{id}/posts` 지연이 커지고,
뒤 페이지일수록 급격히 느려진다.

## 원인

`BoardPostController`는 `page` + `isRandomPage=true`(기본값) + `lastSeedId` 조합의
페이지 기반 조회다. CLAUDE.md 스스로 "커서 기반 페이징 선호"를 명시하지만
이 경로는 page 파라미터를 받는다:

- OFFSET 페이징은 `OFFSET n`까지의 row를 **읽고 버린다** — 비용 O(page × size)
- 랜덤 페이지 로직(seed 기반 셔플)은 정렬 결과 전체를 대상으로 하면 추가 비용
- `(board_id, is_valid, 정렬컬럼)` 복합 인덱스가 없으면 filesort까지 겹침

## 영향

- read-heavy/normal-day의 최다 호출 경로 → 목록이 느리면 체감 성능 전체가 무너짐
- large(10만 글) 데이터셋부터 뚜렷, medium에서도 뒤 페이지에서 관찰 가능

## 재현 방법

```bash
node datasets/seed.js --profile large
# 0/10/50/100/500 페이지를 같은 횟수씩 순환 요청해 깊이별 비용 곡선을 만든다.
# 예전에는 posts.js의 페이지 선택 코드를 page=500 고정으로 직접 고쳐서 돌렸는데,
# 그러면 실행할 때마다 스크립트를 손대야 하고 그 실행의 스크립트 지문도 달라진다.
k6 run scenarios/deep-paging.js -e DATASET=large
```

결과는 리포트 Breakdown의 **"목록 페이지별"** 표에 페이지별 요청 수와 P95로 남는다.
OFFSET에 비례해 P95가 오르면 이 병목이 확정된다. 일반 트래픽(0~4페이지)에서는 OFFSET이
최대 40이라 이 현상이 나타나지 않으므로, 반드시 이 전용 시나리오로 측정한다.

관찰 지표: `post_list` P95, MySQL `Handler_read_next`(스캔량),
slow.log의 해당 쿼리 `Rows_examined` vs `Rows_sent` 비율.

`EXPLAIN`으로 확정:
```sql
EXPLAIN SELECT ... FROM post WHERE BRD_id=? AND is_valid=1 ORDER BY ... LIMIT 10 OFFSET 5000;
-- rows 값이 OFFSET에 비례하면 확정
```

## 개선 전 선행 조건

공통 조건 넷은 [`README.md`의 "개선 전 공통 선행 조건"](README.md#개선-전-공통-선행-조건)에 있다.
이 병목에만 걸리는 것은 아래 넷이다.

### ① 지금 부하는 **커서 분기를 한 번도 실행하지 않는다** — 코드로 확인함

이게 이 병목에서 가장 중요한 사실이다.

| 확인 대상 | 실제 값 | 위치 |
|---|---|---|
| k6가 보내는 파라미터 | `page`, `sortType=RECENT`, `size=10` — **`isRandomPage`를 보내지 않는다** | `scripts/posts.js:32-34` |
| 서버 기본값 | `isRandomPage=true` | `BoardPostController.java:49` |
| 커서 분기 조건 | `RECENT && !isRandomPage && lastSeedId != null` | `PostRepositoryCustomImpl.java:85` |

셋을 합치면 **지금 부하는 OFFSET 경로만 잰다.** 커서 분기는 `isRandomPage=false`와
`lastSeedId`를 함께 보내야 타는데 부하가 둘 다 보내지 않는다.

그래서 개선이 "커서 페이징으로 전환"이라면 **부하 스크립트도 파라미터를 바꿔 보내야 한다.**
그러면 스크립트 지문이 갈려 옛 Before와의 자동 비교가 끊긴다(정상 동작). **개선 후의 부하
형태로 Before를 다시 재 두는 것**이 순서다 — 그러지 않으면 "OFFSET을 보낸 실행"과
"커서를 보낸 실행"을 비교하게 되고, 그건 쿼리 개선이 아니라 요청이 달라진 것이다.

### ② 깊이 곡선은 `deep-paging` + `medium` 이상에서만 나온다

일반 시나리오의 페이지 분포는 0~4페이지다(`PAGE_WEIGHTS = [0.55, 0.20, 0.12, 0.08, 0.05]`,
`scripts/lib/sampling.js:96`). OFFSET이 최대 40이라 **0페이지와 비용 차이가 사실상 없다** —
일반 시나리오로는 이 병목의 개선이 보이지 않는다.

`small`(전체 500건)로 `deep-paging`을 돌리면 깊은 페이지가 빈 배열을 반환하고, 빈 응답은
빠르기 때문에 **"깊은 페이지도 싸다"는 정반대 결론**이 난다. 500페이지 × size 10은
5,010번째 글까지 존재해야 한다는 뜻이다.

### ③ 정렬 축이 하나뿐이다

부하는 `sortType=RECENT`만 쓴다. `LIKE`·`VIEW` 정렬(`getOrderSec()`)은 한 번도 측정되지
않으므로, **그쪽 인덱스를 고쳐도 결과에 나타나지 않는다.** 개선 범위에 다른 정렬을 넣을
거라면 부하에 그 축을 먼저 추가한다.

### ④ 카운트 비용을 OFFSET 비용과 혼동하지 말 것

목록 응답의 `total`은 `RedisPostsCache.getCount()`가 돌려주고, 그 값은 **60분 TTL로
캐시된다**(`RedisPostsCache.java`의 `COUNT_TTL`, 2026-08-28 전에는 5분이었다 — KI-56). 캐시
미스일 때만 `countTotal()`의 `COUNT(*)`가 실행된다.


즉 `COUNT(*)`는 목록 요청마다 도는 비용이 **아니다.** OFFSET을 고쳐도 남고, 반대로 캐시가
식은 구간에서는 OFFSET과 무관하게 튄다. 두 비용을 분리해서 봐야 하며, 후자는 이 병목이
아니라 BTL-004(캐시)의 영역이다.

### 선택 — 레벨 3 지표

`mysql.fullScanRows`(T-29, 카탈로그 미등록)를 넣으면 인덱스·정렬 개선이 실제로 읽는 행 수를
줄였는지 수치로 볼 수 있다. 없어도 `EXPLAIN`으로 확정 가능하므로(E-40) 필수는 아니다.

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| 커서(keyset) 페이징 전환 | O(size)로 상수화 | "n페이지로 점프" UX 포기 (무한 스크롤이면 무손실) |
| 복합 인덱스 `(BRD_id, is_valid, PST_id DESC)` | filesort 제거 | 쓰기 오버헤드 소폭 |
| 랜덤 페이지를 seed 기반 커서로 재설계 | 랜덤성 유지 + 비용 상수화 | 구현 복잡도 |
| 커버링 인덱스로 id만 뽑고 IN 조회 (지연 조인) | OFFSET 비용 절반 이하 | 쿼리 2회 |
