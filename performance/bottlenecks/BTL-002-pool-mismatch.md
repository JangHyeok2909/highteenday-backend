# BTL-002: Tomcat 400 스레드 vs HikariCP 기본 10 커넥션 불균형

> 유형: Connection Pool / Thread Pool
> 상태: 의심
> 관련: EXP-002

## 증상

중간 이상 부하에서 P99가 계단식으로 급등하고, 최악의 경우
`SQLTransientConnectionException: ... - Connection is not available` (30초 타임아웃).
CPU는 한가한데 지연만 커지는 전형적 "대기형" 병목.

## 원인

`application.properties`:
- `server.tomcat.threads.max=400` — 요청 스레드 400개까지 허용
- HikariCP `maximumPoolSize` 미설정 — **기본값 10**

DB를 만지는 요청이 동시에 10개를 넘는 순간, 나머지 스레드는 전부
`hikaricp_connections_pending`에 쌓인다. 스레드 400개는 오히려 대기열을
DB 앞까지 깊게 끌고 들어와 문제를 키운다 (스레드가 많다고 처리량이 늘지 않는다).

## 영향

- 쓰기 비중이 있는 모든 시나리오 (write-heavy, peak-hour, spike)
- 트랜잭션이 길수록(외부 API 호출·파일 처리 포함 트랜잭션) 임계 동시성이 낮아짐
- 전파 범위: DB를 쓰는 **모든** 엔드포인트 — 캐시 히트 경로만 생존

## 재현 방법

```bash
k6 run scenarios/stress.js -e DATASET=medium
# 관찰: hikaricp_connections_pending > 0 시작 시점과
#       클라이언트 P99 급등 시점이 일치하는지 (Grafana 패널 7, 8)
```

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| HikariCP 크기 상향 (예: 20~30) | 임계 동시성 상향 | MySQL max_connections 및 DB CPU와 균형 필요. 무한정 늘리면 DB 컨텍스트 스위칭으로 역효과 |
| Tomcat threads 하향 (예: 100) | 대기 지점을 accept 큐로 이동 — 실패가 빨라짐 | 순수 캐시/정적 경로의 동시성도 함께 제한 |
| 트랜잭션 다이어트 | 커넥션 점유 시간 자체를 단축 (근본 해결) | 코드 수정 범위 큼 |
| connectionTimeout 하향 (30s→3s) | 고갈 시 fail-fast — 스레드 적체 방지 | 순간 스파이크에 오류율 상승 |

권장 순서: 계측(EXP-002) → 풀 크기 실험 → 트랜잭션 다이어트.
"풀 크기 = `core*2 + spindle`" 공식을 출발점으로 하되 실측으로 확정한다.
