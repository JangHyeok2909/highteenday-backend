# Metrics — 측정 지표 정의

**측정하지 않은 것은 개선할 수 없고, 정의하지 않은 지표는 신뢰할 수 없다.**
모든 실험은 아래 지표를 동일한 방법으로 수집한다.

## 수집 경로 총람

```mermaid
flowchart LR
    K6[k6] -->|remote write| P[(Prometheus)]
    APP[Spring Boot<br/>/actuator/prometheus] -->|scrape 5s| P
    MEX[mysqld-exporter] --> P
    REX[redis-exporter] --> P
    CAD[cAdvisor] --> P
    NEX[node-exporter<br/>호스트 = WSL2 VM] --> P
    P --> G[Grafana<br/>perf-overview 대시보드]
    K6 -->|handleSummary| R[reports/raw/*.json/csv/html]
    MY[(MySQL slow.log<br/>performance_schema)] -.->|사후 분석| A[병목 분석]
    JFR[JFR /tmp/perf.jfr<br/>GC 로그 /tmp/gc.log] -.->|사후 분석| A
```

k6 → Prometheus 전송 시 트렌드 통계를 명시해야 P50/P95/P99가 게이지로 노출된다:

```bash
K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
K6_PROMETHEUS_RW_TREND_STATS="p(50),p(95),p(99),avg,max" \
k6 run -o experimental-prometheus-rw scenarios/normal-day.js
```

## 1. 클라이언트 관점 (k6) — SLO 판정의 기준

| 지표 | 소스 | 정의/판정 |
|------|------|-----------|
| TPS/RPS | `rate(k6_http_reqs_total[15s])` | 처리율. breakpoint 테스트의 산출물 |
| Latency P50/P90/P95/P99 | `k6_http_req_duration_p*` | **P95가 1차 SLO** (읽기<300ms, 쓰기<500ms). 평균은 판정에 쓰지 않는다 |
| Error Rate | `k6_http_req_failed_rate` | HTTP 실패율 <1%. `check` 실패는 별도(`k6_checks_rate`) |
| Timeout | http_req_duration 상한 도달 + failed | k6 기본 60s. 타임아웃은 오류율에 합산됨 |
| WS RTT | `chat_ws_rtt` (커스텀 Trend) | 메시지 전송→브로드캐스트 수신 왕복. P95<500ms |
| VUs / dropped_iterations | `k6_vus`, `k6_dropped_iterations_total` | arrival-rate 실행 시 dropped 증가 시점 = 포화점 |

## 2. 애플리케이션 (Micrometer /actuator/prometheus)

| 영역 | 지표 | PromQL | 경보 기준 |
|------|------|--------|-----------|
| CPU | 프로세스 CPU | `process_cpu_usage` | 지속 >0.85 |
| Memory/Heap | 힙 사용률 | `sum(jvm_memory_used_bytes{area="heap"}) / sum(jvm_memory_max_bytes{area="heap"})` | soak에서 우상향 추세 = 누수 |
| GC | pause p99 | `histogram_quantile(0.99, sum(rate(jvm_gc_pause_seconds_bucket[1m])) by (le))` | >200ms (MaxGCPauseMillis 목표) |
| GC | 빈도 | `rate(jvm_gc_pause_seconds_count[1m])` | Full GC 발생 여부는 GC 로그로 교차 확인 |
| Thread | 라이브 스레드 | `jvm_threads_live_threads` | soak 우상향 = 스레드 누수 |
| Tomcat | busy/max | `tomcat_threads_busy_threads` vs 400 | busy≈max → 큐잉 시작 |
| HikariCP | active/pending | `hikaricp_connections_active`, `hikaricp_connections_pending` | **pending>0 지속 = 풀 고갈** |
| HikariCP | 획득 대기 | `hikaricp_connections_acquire_seconds` p99 | >10ms 지속이면 풀 확대/쿼리 단축 검토 |
| 서버 관점 지연 | URI별 p95 | `http_server_requests_seconds_bucket` by uri | 클라이언트 P95와 격차 = 네트워크/큐잉 |
| WebSocket | 세션 수 | 커스텀 게이지 필요(개선 항목) — 임시로 `jvm_threads` + k6 `k6_ws_sessions` | — |
| Event/Scheduler | @Scheduled 실행 시간 | JFR/로그 타임스탬프로 사후 분석 | flush 주기 초과 = 적체 |

## 3. MySQL (mysqld-exporter + performance_schema)

| 지표 | PromQL / SQL | 의미 |
|------|--------------|------|
| threads_running | `mysql_global_status_threads_running` | 동시 실행 쿼리. 코어 수 2~3배 초과 지속 = 포화 |
| slow queries | `rate(mysql_global_status_slow_queries[1m])` | perf.cnf 기준 100ms 초과 쿼리 |
| row lock wait | `mysql_global_status_innodb_row_lock_waits`, `..._row_lock_time` | 반응 편중 실험의 핵심 지표 |
| buffer pool 히트 | `1 - (rate(mysql_global_status_innodb_buffer_pool_reads[1m]) / rate(mysql_global_status_innodb_buffer_pool_read_requests[1m]))` | <0.99면 buffer pool 부족 |
| Top 쿼리 | `SELECT ... FROM performance_schema.events_statements_summary_by_digest ORDER BY SUM_TIMER_WAIT DESC LIMIT 10;` | 실험 후 사후 분석 (tools/README 참고) |
| slow log | `/var/lib/mysql/slow.log` → `pt-query-digest` 또는 직접 열람 | 쿼리 단위 원인 규명 |

## 4. Redis (redis-exporter)

| 지표 | PromQL | 의미 |
|------|--------|------|
| Cache Hit Ratio | `rate(redis_keyspace_hits_total[1m]) / (rate(hits)+rate(misses))` | 읽기 시나리오에서 <0.9면 캐시 설계 점검 |
| ops/s | `rate(redis_commands_processed_total[1m])` | — |
| 메모리/evicted | `redis_memory_used_bytes`, `rate(redis_evicted_keys_total[1m])` | eviction 발생 = maxmemory 도달 (캐시 유효기간 재설계) |
| 명령 지연 | `redis_commands_duration_seconds_total` / slowlog | Redis는 보통 원인이 아니라 증상 — 1ms 초과 명령만 추적 |
| Pub/Sub | `redis_pubsub_channels` | 채팅 브로커 전환(OPT 후보) 시 사용 |

## 5. 컨테이너 (cAdvisor)

| 지표 | PromQL |
|------|--------|
| CPU | `rate(container_cpu_usage_seconds_total{name=~"perf-.*"}[1m])` |
| 메모리 | `container_memory_working_set_bytes{name=~"perf-.*"}` |
| 네트워크 | `rate(container_network_transmit_bytes_total[1m])` |
| CPU 스로틀링 | `rate(container_cpu_cfs_throttled_seconds_total[1m])` — 리소스 상한 도달 신호 |

## 6. 호스트 (node-exporter)

cAdvisor는 컨테이너를 **하나하나** 본다. 그것들이 합쳐서 머신을 얼마나 밀었는지는 보지
못한다. 컨테이너별 CPU가 전부 한가해 보여도 호스트 run queue가 길면 응답시간은 늘어난다.

| 지표 | PromQL | 왜 보나 |
|------|--------|---------|
| CPU 사용률 | `100*(1-avg(rate(node_cpu_seconds_total{mode="idle"}[1m])))` | 머신 전체 포화 |
| 코어당 run queue | `avg(node_load1)/scalar(count(count by (cpu)(node_cpu_seconds_total)))` | 1 초과면 실행 대기가 코어보다 많다 |
| iowait | `100*avg(rate(node_cpu_seconds_total{mode="iowait"}[$RANGE]))` | 병목이 CPU가 아니라 I/O인지 |
| steal | `100*avg(rate(node_cpu_seconds_total{mode="steal"}[$RANGE]))` | VM 밖 부하의 간접 증거 |
| 가용 메모리 | `min_over_time(node_memory_MemAvailable_bytes[$RANGE:])` | 페이지 캐시 압박 |

> **여기서 "호스트"는 WSL2 VM이다.** Docker Desktop이 WSL2 백엔드로 돌므로 이 컨테이너가
> 보는 것은 Windows가 아니라 그 안의 VM이다(커널 `6.18-microsoft-standard-WSL2`, 코어 20,
> 메모리 16.5GB). Windows에서 직접 실행하는 `k6.exe`는 이 VM 밖이라 **잡히지 않는다.**
>
> `node_load1 / count(...)`를 그대로 쓰면 안 된다. 왼쪽에는 `instance`·`job` 레이블이 있고
> 오른쪽 집계에는 없어서 벡터 매칭이 실패해 **빈 결과**가 된다(실측). `scalar()`로 접는다.

## 7. 부하 발생기 (cAdvisor, `perf-k6` 컨테이너)

부하 발생기가 측정 대상과 같은 머신을 쓰면 서로 자원을 뺏는다(E-01). 물리적 분리가
최선이지만, 분리하지 못했다면 **최소한 얼마나 먹었는지는 기록해야** "이 결과는 로컬 상대
비교로만 유효하다"고 말할 근거가 생긴다.

이 지표들은 `perf-run.js --loadgen docker`로 돌릴 때만 값이 있다. 로컬 `k6.exe`는 cAdvisor도
node-exporter도 보지 못하므로 전부 결측이 되는데, **그 결측 자체가 "부하 발생기를 측정하지
않았다"는 정확한 기록이다.**

| 지표 | PromQL | 왜 보나 |
|------|--------|---------|
| CPU | `rate(container_cpu_usage_seconds_total{name="perf-k6"}[1m])` | 측정 대상에서 뺏은 양 |
| throttling | `rate(container_cpu_cfs_throttled_periods_total{name="perf-k6"}[$RANGE])` | **0이 아니면 지연이 서버가 아니라 발생기 탓일 수 있다** |
| 메모리 | `container_memory_working_set_bytes{name="perf-k6"}` | VU가 많으면 여기가 먼저 터진다 |

throttling 임계가 앱(warn 1% / fail 10%)보다 낮은 warn 1% / fail 5%인 이유가 있다. 앱의
throttling은 *측정된 사실*이지만 발생기의 throttling은 *측정이 오염됐다는 신호*라 훨씬 적은
양에도 반응해야 한다. 다만 `gate:false`다 — `--loadgen local` 실행이 전부 `UNMEASURED`가
되어 판정 자체가 막히면 안 되고(T-08), 이 값은 배포를 막는 축이 아니라 다시 재라는 경고다.

실측(large, 10 VU · 45초): 부하 발생기 CPU 최대 **0.026 코어** · throttled **0.194%** ·
메모리 **145.5MB**. 같은 구간 앱은 **1.239 코어**를 썼다 — 발생기가 앱의 1/48이다.

## 대시보드

`dashboards/perf-overview.json` — Grafana에 자동 프로비저닝됨 (http://localhost:3001).
배치: 1행 k6(부하 관점) → 2행 JVM → 3행 풀/DB → 4행 Redis/컨테이너.
**읽는 순서 = 병목 추적 순서**: 지연 상승 확인(1행) → GC/스레드 원인인지(2행) →
풀 대기인지(3행) → 데이터 계층인지(3~4행).

## 지표 해석 규칙

1. **평균 금지** — 판정은 P95/P99. 평균은 스파이크를 숨긴다.
2. **클라이언트 P95 vs 서버 P95 격차** — 격차가 크면 병목은 앱 내부가 아니라 큐(Tomcat accept, 커널 백로그).
3. **처리율-지연 곡선** — RPS가 멈추고 지연만 오르기 시작하는 지점(knee)이 실질 용량.
4. **단일 지표로 결론 금지** — 예: P95 상승 + hikaricp_pending>0 + threads_running 정상 → DB가 아니라 풀 크기 문제.
