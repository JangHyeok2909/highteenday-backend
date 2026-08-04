# EXP-001: 기준선 측정 — Normal Day 200 VU

> 상태: 계획
> 날짜: | 담당: | 관련: 없음 (모든 실험의 전제)

## 1. 목적

평상시 트래픽(200 VU, 읽기 중심)에서 현재 시스템의 성능 기준선을 확보한다.
이후 모든 최적화의 Before 값이자 `regression/baseline.json`의 원천.

## 2. 가설

> **H1**: 200 VU Normal Day 부하에서 읽기 P95 < 300ms, 쓰기 P95 < 500ms,
> 오류율 < 1%를 충족할 것이다. 근거: Tomcat 400 스레드 대비 낮은 동시성,
> 게시글 목록/HOT은 Redis 캐시 경로.

- 반증 조건: 어느 하나라도 SLO 초과 시 기각 — 초과 지표가 곧 첫 병목 후보.

## 3. 배경

첫 실험. CLAUDE.md의 Performance Guidelines(캐시, 커서 페이징, 카운터 버퍼링)가
실제로 SLO를 지키는지 수치로 확인한 적이 없다.

## 4. 테스트 환경

| 항목 | 값 |
|------|-----|
| 앱 커밋 | (실행 시 기입) |
| 데이터셋 | medium (1,000명/10,000글) |
| 캐시 상태 | warm — 시드 직후 read-heavy 5분 워밍업 후 실행 |
| 특이사항 | |

## 5. 시나리오 / 실행 방법

```bash
node datasets/seed.js --profile medium          # 최초 1회
k6 run scenarios/read-heavy.js -e DATASET=medium -e HOLD=5m -e VUS=50   # 워밍업
K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
K6_PROMETHEUS_RW_TREND_STATS="p(50),p(95),p(99),avg,max" \
k6 run -o experimental-prometheus-rw scenarios/normal-day.js -e DATASET=medium
```

## 6. 측정 지표

| 역할 | 지표 | 판정 기준 |
|------|------|-----------|
| 1차 | http_req_duration{op:read} P95 | < 300ms |
| 1차 | http_req_duration{op:write} P95 | < 500ms |
| 1차 | http_req_failed rate | < 1% |
| 보조 | RPS, CPU(app/mysql), heap, hikaricp_active, redis hit ratio | 기준선 기록용 |

## 7. 결과

(실행 후 기입 — reports/raw/normal-day-*.summary.json 링크)

## 8. 그래프

(Grafana perf-overview, 실행 시간 범위 고정 캡처)

## 9. 병목 분석

(SLO 초과 항목이 있으면 원인 추적, 없으면 여유율 기록)

## 10. 개선

없음 — 관찰 실험.

## 11. 재실험

해당 없음 (기준선). 단, 이 결과를 `regression/baseline.json`에 저장:

```bash
node tools/compare.js --save-baseline reports/raw/normal-day-<ts>.summary.json
```

## 12. 결론

(기입)

## 13. 향후 개선

- SLO 초과 지표 → 해당 병목 실험(EXP-002~005)의 우선순위 결정
- 기준선 대비 ±10% 이탈을 회귀 기준으로 설정
