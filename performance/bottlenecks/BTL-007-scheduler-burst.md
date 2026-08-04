# BTL-007: 스케줄러 flush 버스트가 온라인 트래픽에 주는 간섭

> 유형: Scheduler / DB / Event
> 상태: 의심
> 관련: soak / normal-day 시나리오에서 주기적 스파이크로 관찰 가능

## 증상

부하가 일정한데도 P95/P99 그래프에 **주기적인 스파이크**가 나타난다.
주기가 스케줄러 실행 간격과 일치하면 이 병목이다.

## 원인

백그라운드 스케줄러 4종이 온라인 트래픽과 같은 DB/커넥션 풀을 공유:

| 스케줄러 | 동작 | 위험 |
|----------|------|------|
| ViewCountScheduler | Redis 조회수 → DB flush | 대상 게시글 수만큼 UPDATE 버스트. 개별 UPDATE면 수천 쿼리 |
| HotScoreScheduler | HOT 점수 재계산 → Sorted Set 갱신 | 전 게시글 스캔형 쿼리일 경우 buffer pool 오염 |
| TokenCleanupScheduler | 만료 토큰 삭제 | 대량 DELETE 시 락/undo 비용 |
| SchoolMealScheduler | NEIS 외부 API 수집 | 외부 지연이 스레드 점유로 전이 가능 |

버스트 동안 HikariCP 커넥션을 스케줄러가 선점하면 (BTL-002와 결합)
온라인 요청의 대기가 증폭된다.

## 영향

- 모든 시나리오에 주기적 노이즈로 나타남 — **다른 실험의 교란 변수**이기도 하므로
  실험 문서에는 스케줄러 실행 시각을 함께 기록해야 한다
- 게시글 수가 늘수록 flush 대상이 커져 악화 (large 데이터셋에서 뚜렷)

## 재현 방법

```bash
# 일정 부하를 걸고 스파이크 주기를 스케줄러 주기와 대조
k6 run scenarios/normal-day.js -e DATASET=large -e HOLD=30m
# 앱 로그에서 스케줄러 실행 타임스탬프 추출 → Grafana annotation으로 오버레이
```

관찰 지표: P95 시계열의 주기성, 스케줄러 실행 시각과의 교차상관,
실행 중 `hikaricp_connections_active` 점프.

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| flush를 배치 UPDATE(CASE WHEN / temp table JOIN)로 | 쿼리 수천→수개 | SQL 복잡도 |
| chunk 분할 + 사이 sleep | 버스트 평탄화 | flush 완료 시간 증가 |
| 스케줄러 전용 커넥션 풀 분리 | 온라인 트래픽 보호 | 풀 관리 복잡도 |
| 저트래픽 시간대로 스케줄 이동 | 즉효 | 데이터 신선도 저하 |
