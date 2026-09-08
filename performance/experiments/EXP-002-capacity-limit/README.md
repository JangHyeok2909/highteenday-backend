# EXP-002: 한계 용량 탐색 — 무엇이 먼저 무너지는가

> 상태: 계획 (미착수) — 사유는 [experiments/README.md](../README.md) 실험 목록 아래 참고
> 날짜: | 담당: | 관련: BTL-002 (커넥션 풀 불균형)

## 1. 목적

시스템의 최대 지속 가능 TPS와 **최초 붕괴 지점**(어느 리소스가 먼저 포화되는가)을 찾는다.

## 2. 가설

> **H1**: Tomcat 스레드(400)보다 HikariCP(기본 10)가 훨씬 작으므로,
> 쓰기 비중이 있는 부하에서는 DB CPU나 앱 CPU가 포화되기 전에
> **커넥션 풀 대기(hikaricp_connections_pending > 0)가 최초 병목**으로 나타날 것이다.
> 그 시점의 클라이언트 증상은 P99 급등(획득 대기 최대 30초) 후 timeout이다.

- 반증 조건: pending이 0인 상태에서 CPU/메모리/DB가 먼저 포화되면 기각.

## 3. 배경

`application.properties`: `server.tomcat.threads.max=400`, HikariCP 크기 미설정(기본 10).
400개의 요청 스레드가 10개의 커넥션을 두고 경쟁하는 구조 → `bottlenecks/BTL-002.md`.

## 4. 테스트 환경

| 항목 | 값 |
|------|-----|
| 데이터셋 | medium |
| 캐시 상태 | warm |
| 앱 커밋 | (기입) |

## 5. 시나리오 / 실행 방법

```bash
# 1단계: 계단식 스트레스 — 붕괴 순서 관찰
node tools/perf-run.js scenarios/stress.js --dataset medium --loadgen docker
# 2단계: 도달률 기반 정밀 측정 — 최대 TPS 수치 확정
node tools/perf-run.js scenarios/breakpoint.js --dataset medium --loadgen docker
```

## 6. 측정 지표

| 역할 | 지표 | 판정 기준 |
|------|------|-----------|
| 1차 | hikaricp_connections_pending | >0 지속 시작 시점의 VU/RPS |
| 1차 | k6 dropped_iterations | 증가 시작 = 포화점 |
| 보조 | tomcat_threads_busy, process_cpu_usage, mysql threads_running, GC pause | 붕괴 순서 타임라인 작성 |

## 7. 결과

(기입: 최대 TPS, 붕괴 순서 타임라인)

## 8. 그래프

(포화 구간의 RPS-지연 knee 곡선 + 풀 pending 그래프)

## 9. 병목 분석

(pending 시작 → acquire p99 → 클라이언트 P99 전파 체인을 시간축으로 검증)

## 10. 개선

후보 (분석 확정 후 하나씩만 적용):
- HikariCP maximumPoolSize 조정 — 공식: `connections = core_count * 2 + spindle` 기준으로 실험
- Tomcat max-threads를 풀 크기에 맞춰 하향 (대기 지점을 accept 큐로 이동)

## 11. 재실험

| 지표 | Before | After | 변화 |
|------|--------|-------|------|
| 최대 TPS | | | |
| 포화 시 P99 | | | |
| pending 시작 VU | | | |

## 12. 결론

(기입)

## 13. 향후 개선

- 확정된 최대 TPS의 60%를 soak 테스트 강도로 사용
- 확정된 최대 TPS를 이 문서와 `docs/planning/perf-trust-levels.md`에 기록한다 (손으로 저장하는 기준선 파일은 없다 — 기준선은 이력에서 자동 선택된다)

