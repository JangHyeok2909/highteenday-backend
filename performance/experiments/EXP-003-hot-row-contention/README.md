# EXP-003: 인기글 비정규화 카운터 락 경합

> 상태: 계획
> 날짜: | 담당: | 관련: BTL-003

## 1. 목적

좋아요/댓글이 소수 인기글에 몰릴 때(Zipf), `Post.likeCount` 등 비정규화 카운터의
동일 row UPDATE 경합이 지연에 미치는 영향을 정량화한다.

## 2. 가설

> **H1**: write-heavy 부하(reaction Zipf 편중)에서 반응 API의 P99는
> `innodb_row_lock_waits` 증가와 강한 시간 상관을 보일 것이다.
> 반응이 완전 균등 분포일 때 대비 P99가 유의하게(2배 이상) 높을 것이다.
> 근거: Post 엔티티가 likeCount/commentCount를 컬럼으로 들고 있어(README 명세)
> 인기글 1개 = 물리 row 1개에 쓰기가 직렬화된다.

- 반증 조건: Zipf/균등 P99 차이가 오차 범위 내이거나 lock wait 상관이 없으면 기각.

## 3. 배경

CLAUDE.md: "Post carries likeCount, dislikeCount, commentCount, scrapCount to avoid
joins on hot paths" — 읽기 최적화가 쓰기 경합으로 전이되는 전형적 트레이드오프.

## 4. 테스트 환경

| 항목 | 값 |
|------|-----|
| 데이터셋 | medium |
| 캐시 상태 | warm |

## 5. 시나리오 / 실행 방법

```bash
# A: Zipf 편중 (기본) — scripts/reactions.js 는 hotPost() 사용
k6 run -o experimental-prometheus-rw scripts/reactions.js -e VUS=100 -e DURATION=5m -e DATASET=medium
# B: 대조군 — 균등 분포. 스크립트에서 hotPost() → randomPost() 로 바꾼 브랜치 또는
#    -e UNIFORM=1 플래그 추가 후 실행 (변경 커밋 기록)
```

## 6. 측정 지표

| 역할 | 지표 | 판정 기준 |
|------|------|-----------|
| 1차 | http_req_duration{name:post_reaction} P99 | A vs B 2배 이상 차이 |
| 1차 | rate(mysql_global_status_innodb_row_lock_waits[1m]) | A에서만 유의 증가 |
| 보조 | innodb_row_lock_time, deadlock 로그(`SHOW ENGINE INNODB STATUS`) | 데드락 여부 |

## 7~8. 결과 / 그래프

(기입 — A/B 두 실행의 시간축 겹쳐 그리기)

## 9. 병목 분석

- lock wait 확인 SQL: `SELECT * FROM performance_schema.data_lock_waits;` (부하 중 스냅샷)
- 어느 UPDATE 문이 대기하는지 `events_statements_summary_by_digest`로 확정

## 10. 개선

후보 (하나씩 실험):
1. 반응 카운터를 Redis INCR로 버퍼링 후 스케줄러 flush (조회수와 동일 패턴 — 기존 코드 재사용)
2. `UPDATE post SET like_count = like_count + 1` 원자 UPDATE로 전환 (엔티티 로드 없이) — 락 보유 시간 단축
3. 카운터 테이블 분리 (post_counter) — 본문 row와 락 분리

## 11. 재실험

| 지표 | Before | After | 변화 |
|------|--------|-------|------|
| reaction P99 (Zipf) | | | |
| row_lock_waits/min | | | |
| reaction 처리율 | | | |

## 12~13. 결론 / 향후 개선

(기입 — 채택안이 조회 정합성[좋아요 수 표시 지연]에 주는 영향 명시)
