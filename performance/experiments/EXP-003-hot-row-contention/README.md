# EXP-003: 인기글 비정규화 카운터 락 경합

> 상태: 계획 (미착수) — 사유는 [experiments/README.md](../README.md) 실험 목록 아래 참고
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

> ⚠ **반응만으로 재면 경합을 과소평가한다** (2026-08-16 large 시딩 실측에서 드러남).
>
> `(사용자, 게시글)` 유니크 제약 때문에 한 글이 받을 수 있는 활성 반응의 상한이 사용자
> 수다. large 시딩에서 가장 뜨거운 글이 **9,999에서 막혀** 전체의 1.00%만 가져갔다.
> 같은 Zipf인데 그 제약이 없는 댓글은 8.52%, 스크랩은 6.28%가 한 행에 몰렸다.
> **유니크 제약이 부하 분산기 노릇을 해 핫로우 경합을 가린다.**
>
> 단계별 재시도율도 그 방향이었다 — 스크랩 1.96% > 댓글 0.87% > 반응 0.59%.
> 요청 수는 반응이 12배 많은데도 그렇다.
>
> 운영 트래픽에는 그 상한이 없다. 한 사용자가 좋아요를 눌렀다 취소했다 다시 누르면
> 같은 행이 매번 갱신된다(토글 API — KI-54). 따라서 H1을 반응 **생성**만으로 검증하면
> 실제보다 약한 경합을 재게 된다.
>
> **설계 보완**: ① 댓글 경로를 함께 재거나, ② 반응을 토글 반복(on/off)으로 돌려 유니크
> 제약에 막히지 않게 한다. 어느 쪽이든 "무엇이 상한을 만들었는가"를 결과에 기록할 것.
> 근거 수치는 [BTL-003](../../bottlenecks/BTL-003-hot-row-counter.md)의 "집중도까지 같이
> 봐야 한다" 절에 있다.

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
node tools/perf-run.js scripts/reactions.js --dataset medium -e VUS=100 -e DURATION=5m --loadgen docker
# B: 대조군 — 균등 분포. 스크립트에서 hotPost() → randomPost() 로 바꾼 브랜치 또는
#    -e UNIFORM=1 플래그 추가 후 실행 (변경 커밋 기록)
```

## 6. 측정 지표

| 역할 | 지표 | 판정 기준 |
|------|------|-----------|
| 1차 | http_req_duration{name:post_reaction} P99 | A vs B 2배 이상 차이 |
| 1차 | rate(mysql_global_status_innodb_row_lock_waits[1m]) | A에서만 유의 증가 |
| 보조 | innodb_row_lock_time, deadlock 로그(`SHOW ENGINE INNODB STATUS`) | 데드락 여부 |

> ⚠ **이 표의 락 지표는 아직 지표 카탈로그에 없어 리포트에 나타나지 않는다.**
> `mysql.innodbRowLockWaits`는 조회 순간의 스냅샷(`Innodb_row_lock_current_waits`)이라
> 구간 누적 대기 시간을 알 수 없고, `innodb_row_lock_time`은 등록조차 되어 있지 않다.
> 실험을 시작하기 전에 [BTL-003의 "개선 전 선행 조건"](../../bottlenecks/BTL-003-hot-row-counter.md#개선-전-선행-조건--락-지표를-먼저-수집한다)
> 절을 따라 락 지표를 먼저 추가할 것. 추가하지 않으면 §11 재실험 표의 Before/After를 채울
> 근거가 없다.

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
