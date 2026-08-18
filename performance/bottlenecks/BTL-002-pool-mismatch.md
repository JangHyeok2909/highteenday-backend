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

## 개선 전 선행 조건

공통 조건 넷은 [`README.md`의 "개선 전 공통 선행 조건"](README.md#개선-전-공통-선행-조건)에 있다.
이 병목에만 걸리는 것은 아래 넷이다.

### ① 판정 지표는 이미 다 수집된다 — 여기는 막혀 있지 않다

`tools/lib/metrics-catalog.js`의 `pool` 그룹에 필요한 것이 전부 있다.

| 키 | 이 병목에서의 역할 |
|---|---|
| `pool.hikariPending` (avg·max·p95) | **1차 근거.** >0이 지속되면 풀이 병목이다 |
| `pool.hikariAcquireP95Ms` | 커넥션을 받기까지의 대기 — 응답시간에 그대로 더해진다 |
| `pool.hikariTimeouts` | 커넥션을 못 받고 실패한 횟수. 0이어야 정상 |
| `pool.hikariMax` | 포화도(`saturation.hikariPct`)의 분모 |
| `pool.tomcatBusy` / `pool.tomcatMax` | 스레드 400개가 실제로 얼마나 붙잡혔는가 |

즉 이 병목은 **레벨 3 지표를 기다릴 필요가 없다.** 남은 조건은 지표가 아니라 부하 모양과
판정 방식이다.

### ② 타임아웃 검열이 필수다 (T-04 문제 2)

풀 고갈은 **정확히 p95를 측정 상한에 붙이는** 병목이다. EXP-000에서 `p95 = 60000.96ms`가
실제로 기록됐는데, 이는 응답 시간이 아니라 k6의 60초 타임아웃에 걸려 잘린 값이다.

현재 게이트는 이 값이 상한이라는 사실을 모른다. 그래서:

- 개선 후 실제로 55초가 되어도 **"8% 개선"**으로 읽힌다
- 더 나빠져도 값이 60초에서 움직이지 않아 **변화율 0%로 PASS**한다

같은 실행에 `errorRate = 0.558`, `checkRate = 0.443`이 함께 찍혀 있었다 — 요청 절반 이상이
정상 처리되지 않았다는 뜻이다. **p95 변화율 대신 오류율·checkRate와 묶어 별도 실패 상태로
판정하는 처리가 먼저 들어가야 한다.**

### ③ 한계 탐색 부하가 자기 자신을 완화한다 (S-06, S-18)

EXP-002는 `stress`·`breakpoint`로 임계 동시성을 찾는데, 두 시나리오가 closed model이다.
서버가 느려지면 **요청 도착률도 함께 줄어들어 풀 경합이 저절로 약해진다.** 즉 지금 구성으로는
"몇 VU에서 풀이 고갈되는가"에 정확히 답할 수 없다.

`breakpoint`는 서버 한계보다 **k6의 VU 한계에 먼저 걸릴 수 있다**(S-18). 개선 전에 도착률
기반(open model) 전환이 필요하다.

여기에 **S-09**가 겹친다 — 한계 시나리오에 기능별 분해가 없어 "무엇이 먼저 무너졌는가"를
가를 수 없다. 풀 고갈은 DB를 쓰는 모든 엔드포인트로 전파되므로, 분해 없이는 캐시 히트
경로만 살아남은 상태와 전면 장애를 구분하지 못한다.

### ④ Before 풀 크기를 문서에 확정해 둘 것

`application.properties`에 `spring.datasource.hikari.maximum-pool-size`가 **없다**(확인함).
따라서 현재 값은 HikariCP 기본값 10이다. 그런데 `environment/README.md`의 풀 표는
`maximumPoolSize | 프로파일 확인 후 기입 (기본 10)`으로 **비어 있다.**

이 병목의 개선안 중 하나가 바로 그 값을 바꾸는 것이므로, **Before가 10이었다는 사실이
기록에 남아 있어야 한다.** `pool.hikariMax`가 실행마다 `run.json`에 기록되므로 Before 세트의
그 값을 문서에 옮겨 적는다.

## 해결 방법

| 후보 | 효과 | 트레이드오프 |
|------|------|--------------|
| HikariCP 크기 상향 (예: 20~30) | 임계 동시성 상향 | MySQL max_connections 및 DB CPU와 균형 필요. 무한정 늘리면 DB 컨텍스트 스위칭으로 역효과 |
| Tomcat threads 하향 (예: 100) | 대기 지점을 accept 큐로 이동 — 실패가 빨라짐 | 순수 캐시/정적 경로의 동시성도 함께 제한 |
| 트랜잭션 다이어트 | 커넥션 점유 시간 자체를 단축 (근본 해결) | 코드 수정 범위 큼 |
| connectionTimeout 하향 (30s→3s) | 고갈 시 fail-fast — 스레드 적체 방지 | 순간 스파이크에 오류율 상승 |

권장 순서: 계측(EXP-002) → 풀 크기 실험 → 트랜잭션 다이어트.
"풀 크기 = `core*2 + spindle`" 공식을 출발점으로 하되 실측으로 확정한다.
