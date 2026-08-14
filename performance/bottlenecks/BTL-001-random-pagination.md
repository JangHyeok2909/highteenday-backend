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

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| 커서(keyset) 페이징 전환 | O(size)로 상수화 | "n페이지로 점프" UX 포기 (무한 스크롤이면 무손실) |
| 복합 인덱스 `(BRD_id, is_valid, PST_id DESC)` | filesort 제거 | 쓰기 오버헤드 소폭 |
| 랜덤 페이지를 seed 기반 커서로 재설계 | 랜덤성 유지 + 비용 상수화 | 구현 복잡도 |
| 커버링 인덱스로 id만 뽑고 IN 조회 (지연 조인) | OFFSET 비용 절반 이하 | 쿼리 2회 |
