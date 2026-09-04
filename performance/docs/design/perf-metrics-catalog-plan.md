# 성능 지표 카탈로그 확장 판단과 적용 계획

작성일: 2026-08-18

상태: **적용 범위 결정 완료, 구현 전**

대상: `performance/tools/lib/metrics-catalog.js`, `performance/tools/collect.js`,
`performance/scripts/lib/summary.js`, perf 전용 Docker/Prometheus 환경

---

## 1. 이 문서가 답하는 질문

현재 성능 도구는 CPU, 메모리, 힙, GC, HikariCP, Tomcat, MySQL, Redis와 호스트 포화도를
넓게 수집한다. 하지만 병목이 생기면 다음 질문에 충분히 답하지 못한다.

> **무엇이 포화됐는가가 아니라, 어느 요청·Repository 메서드·SQL·Redis 명령·배치가
> 그 포화를 만들었는가?**

Prometheus를 직접 조사한 결과, 이 질문에 필요한 지표 상당수는 이미 노출되고 있다. 문제는
`metrics-catalog.js`가 선택하지 않아 실행별 `run.json`에 남지 않는다는 것이다.

이 문서는 조사 후보를 전부 무조건 추가하는 대신 다음을 결정한다.

- 현재 워킹트리에 이미 반영된 항목은 무엇인가
- 지금 기본 카탈로그에 넣을 항목은 무엇인가
- 다중 시계열이라 별도 저장 구조가 필요한 항목은 무엇인가
- 특정 실험에서만 켤 항목은 무엇인가
- 넣지 않거나, 병목 근거로 해석하지 말아야 할 항목은 무엇인가
- 새 지표를 언제 회귀 게이트로 승격할 것인가

이 문서의 범위는 **성능 측정 도구의 수집·저장 정책**이다. 실제 애플리케이션 결함인 Redis
`KEYS` 제거는 관련성이 커서 함께 기록하지만, 구현 완료 상태는 `docs/KNOWN-ISSUES.md`의
KI-17과 별도로 관리한다.

---

## 2. 결론

**모든 후보를 같은 방식으로 적용하지 않는다.** 다음 세 층으로 나눈다.

```text
1. infra.flat
   실행마다 숫자 하나로 남길 저카디널리티 지표
   → 포화도·직접 실패·회귀 판정에 사용

2. infra.attribution
   엔드포인트·Repository·Redis 명령·스케줄러별 상위 N개
   → 병목의 코드 위치를 찾는 데 사용, 기본 회귀 게이트에는 사용하지 않음

3. artifacts
   SQL digest, Redis SLOWLOG, GC 로그, slow log, JFR
   → 깊은 사후 분석에 사용, 크기와 수집 조건을 별도로 관리
```

최종 적용 판단은 다음과 같다.

| 영역 | 판단 | 핵심 이유 |
|---|---|---|
| MySQL·Redis 컨테이너 CPU/메모리/throttling | **즉시 적용** | 컴포넌트 자원 제한을 앱 문제로 오진하지 않게 함 |
| 에러·경고 로그 증가량 | **즉시 적용** | 비용이 거의 없고 HTTP 성공 뒤에 숨은 실패를 잡음 |
| Young/Full GC 분리 | **즉시 적용** | Full GC 한 번이 합산 지표에 묻히는 문제 제거 |
| Hikari 커넥션 보유 시간 | **즉시 적용** | 풀 부족과 긴 트랜잭션을 구분 |
| 컨테이너 OOM·memory fail | **즉시 적용** | 직접적인 자원 실패 신호 |
| 호스트 PSI·TCP 수락 실패·disk await | **즉시 적용** | 컨테이너 밖 경합을 앱 문제로 오진하지 않게 함 |
| k6 dropped/sending/receiving | **즉시 적용** | 용량 한계와 서버 밖 지연을 구분 |
| 엔드포인트·Repository·Redis·스케줄러 귀속 | **적용, 별도 벡터 구조 필요** | 가장 가치가 크지만 현재 수집기는 모두 스칼라로 접음 |
| SQL digest 상위 20개 | **매 실행 자동 저장** | 작고, 실행별 느린 SQL을 가장 직접적으로 설명 |
| MySQL 쓰기·락 상세 | **직접 신호만 우선 적용** | 이미 수집하는 항목과 중복을 피함 |
| `info_schema.innodb_metrics` collector | **조건부 적용** | 경합 실험에는 유용하지만 시계열·스크레이프 비용 검증 필요 |
| TIME_WAIT·conntrack | **고연결 시나리오용** | 일반 steady-state 실행에서는 우선순위가 낮음 |
| JFR·GC·slow log 전 실행 저장 | **적용하지 않음** | 실행 경계가 불명확하고 저장공간이 과도함 |
| JFR·GC·slow log 조건부 저장 | **WARN/FAIL 또는 명시 실행에 적용** | 증거 보존과 용량을 함께 만족 |
| `messageBrokerTaskScheduler` queue=5 경고 | **적용하지 않음** | 예약된 미래 작업이지 배치 backlog라는 증거가 아님 |

---

## 3. 조사 시점의 실제 상태

### 3.1 이미 워킹트리에 반영된 항목

첨부 조사 결과가 작성된 뒤 다음 항목은 현재 워킹트리에 이미 추가됐다. 아직 검증과 커밋이
끝난 상태라는 뜻은 아니다. 중복 구현하지 말고 현재 변경을 검증·완성해야 한다.

#### MySQL

- `mysql.cpuCores.{avg,max,p95}`
- `mysql.cpuSeconds`
- `mysql.cpuLimitCores`
- `mysql.throttledPct`
- `mysql.selectScan`
- `mysql.selectFullJoin`
- `mysql.tmpDiskTables`
- `mysql.rowLockTimeMs`
- `mysql.rowLockWaitCount`
- `mysql.rollbacks`

#### Redis

- `redis.cpuCores.{avg,max,p95}`
- `redis.cpuSeconds`

#### JVM·k6 시계열

- JVM CPU·JIT·스레드 진단 그룹
- k6 native histogram remote-write
- `k6ts.waitingP95`
- 요청당 앱·JVM·DB·Redis CPU 효율 지표

과거 `run.json`에는 이 값이 없다. Prometheus 보존 기간 안의 실행은 `collect.js --force
--no-wait` 재수집으로 채울 수 있지만, 먼저 현재 카탈로그의 테스트와 실측 검증을 끝내야 한다.

### 3.2 Prometheus에 실제 존재하지만 실행 기록에는 없는 지표

2026-08-18 실행 중인 perf 스택에서 다음 계열이 실제로 확인됐다.

- `http_server_requests_seconds_{bucket,count,sum,max}`
- `spring_data_repository_invocations_seconds_{count,sum,max}`
- `lettuce_command_completion_seconds_{count,sum,max}`
- `logback_events_total`
- `hikaricp_connections_usage_seconds_{count,sum,max}`
- `hikaricp_connections_idle`
- `hikaricp_connections_creation_seconds_{count,sum,max}`
- `tasks_scheduled_execution_seconds_{count,sum,max}`
- `executor_*`
- `node_pressure_{cpu,io,memory}_*`
- `node_disk_*`
- `node_netstat_TcpExt_ListenOverflows`
- `node_netstat_TcpExt_ListenDrops`
- `container_oom_events_total`
- `container_memory_failcnt`
- k6 `http_req_sending`, `http_req_receiving`, `http_req_waiting` 계열

`mysql_info_schema_innodb_metrics_*`만은 현재 노출되지 않는다. mysqld-exporter collector가 꺼져
있기 때문이다.

### 3.3 실측으로 확인된 즉시 조치 대상: Redis KEYS

실행 중 누적 카운터가 다음처럼 일치했다.

```text
ViewCountScheduler.syncViewsToDB 실행 수   58
Lettuce command=KEYS 호출 수              58
```

코드에서도 `ViewCountScheduler`가 60초마다 `consumePendingCounts()`를 호출하고,
`RedisViewCountStore`가 `redisTemplate.keys("post:views:*")`를 실행한다.

따라서 KEYS는 추상적인 후보가 아니라 현재 프로젝트에 직접 존재하는 문제다.

- 단기: Lettuce 명령별 호출 수·평균·최대 시간을 실행에 저장한다.
- 애플리케이션 수정: `SCAN` 또는 별도 pending-post ID 집합으로 전환한다.
- 검증: 변경 전후 `KEYS` 증가량이 0인지, 조회수 동기화 결과가 같은지 확인한다.

---

## 4. 설계 원칙

### 4.1 원시 누적값 대신 실행 구간 증가량을 저장한다

다음 카운터는 애플리케이션·컨테이너 시작 이후 누적값이다.

- `logback_events_total`
- Repository·Lettuce·스케줄러 timer의 count/sum
- OOM·memory fail 카운터
- MySQL global status 카운터

원시값을 저장하면 재시작 시 0으로 돌아가고, 오래 켠 인스턴스가 새 인스턴스보다 나빠 보인다.
항상 `increase(...[$RANGE])` 또는 구간 `rate()`를 사용한다.

### 4.2 라벨이 많은 지표는 전부 저장하지 않는다

다음은 라벨 조합이 늘어날 수 있다.

- HTTP: `uri × method × status × outcome`
- Repository: `repository × method × state × exception`
- Lettuce: `command × local × remote`
- 스케줄러: `namespace × function × outcome × exception`

전부 `infra.flat`에 넣으면 실행 스키마가 계속 바뀌고 `run.json`이 커진다. 상위 N개를
`infra.attribution`에 배열로 저장하고, IP·예외 클래스처럼 비교에 불필요한 라벨은 집계 단계에서
제거한다.

### 4.3 새 지표는 처음에 optional이다

새 지표를 즉시 필수 지표로 만들면 이전 실행과 exporter 비정상 실행이 모두
`UNMEASURED`가 된다. 처음에는 다음 원칙을 따른다.

1. 카탈로그에 optional 진단 지표로 추가
2. 정상 실행 5~10회 이상 수집
3. 결측률과 정상 범위 확인
4. 의미가 명확한 직접 실패 신호부터 게이트에 추가

### 4.4 측정 지표 자체의 비용도 검증한다

기존에 노출된 count/sum/max를 조회하는 비용은 작다. 반면 다음은 새 시계열이나 추가 DB
조회 비용을 만든다.

- Hikari usage histogram 활성화
- mysqld-exporter `info_schema.innodb_metrics` collector 활성화
- HTTP·Repository·Lettuce 벡터 다량 저장
- JFR·slow log 복사

변경 전후 동일한 짧은 진단 실행으로 Prometheus 메모리, 스크레이프 시간, 앱/DB CPU가
유의하게 달라지지 않는지 확인한다.

---

## 5. `infra.flat`에 추가할 지표

아래 키 이름은 현재 카탈로그의 `mysql.*`, `redis.*`, `pool.*`, `host.*` 명명 규칙에 맞춘
권장안이다. 구현 중 실제 노출 라벨과 쿼리 결과를 다시 검증한다.

### 5.1 MySQL·Redis 컨테이너 자원

#### MySQL 추가

```text
mysql.memWorkingSet.{avg,max,p95}
mysql.memLimitBytes
saturation.mysqlCpuPct
saturation.mysqlCpuAvgPct
saturation.mysqlMemoryPct
```

CPU는 이미 들어가 있으므로 메모리와 파생 포화도만 완성한다.

#### Redis 추가

```text
redis.cpuLimitCores
redis.throttledPct
redis.memWorkingSet.{avg,max,p95}
redis.memLimitBytes
saturation.redisCpuPct
saturation.redisCpuAvgPct
saturation.redisContainerMemoryPct
```

`saturation.redisMemPct`는 Redis 서버의 `used_memory / maxmemory`다. 새
`redisContainerMemoryPct`는 cgroup working set / 컨테이너 메모리 제한이다. 두 값은 답하는
질문이 다르므로 하나로 합치지 않는다.

### 5.2 로그 발생량

```text
logs.errorCount
logs.warnCount
efficiency.errorsPerKReq
efficiency.warnsPerKReq
```

PromQL 방향:

```promql
sum(increase(logback_events_total{job="spring-app",level="error"}[$RANGE])) or vector(0)
sum(increase(logback_events_total{job="spring-app",level="warn"}[$RANGE])) or vector(0)
```

초기 정책:

- 리포트에 표시한다.
- `errorCount > 0`이면 병목 가설에 경고를 추가한다.
- 정상 분포가 쌓이기 전에는 회귀 FAIL 기준으로 쓰지 않는다.
- 앱 시작 전·후 전체 누적값이 아니라 measure 구간만 본다.

### 5.3 GC 분리

기존 전체 GC 지표는 유지하고 다음을 보완한다.

```text
gc.youngCount
gc.fullCount
gc.fullPauseTotalMs
gc.fullPauseMaxMs
```

주요 라벨:

```text
action="end of minor GC"
action="end of major GC"
```

Full GC가 없으면 정상값은 `0`이다. 시계열이 존재하지 않아 `null`이 되는 일을 막기 위해
`or vector(0)`를 사용한다.

`gc.fullCount > 0`은 즉시 FAIL로 단정하지 않는다. Full GC 정지시간과 k6 p99가 겹치는지
보고 WARN 또는 병목 가설로 먼저 사용한다.

### 5.4 Hikari 커넥션 보유 시간

우선 기존 count/sum/max로 다음을 저장한다.

```text
pool.hikariUsageCount
pool.hikariUsageAvgMs
pool.hikariUsageMaxMs
pool.hikariIdle.{avg,min,p95}
pool.hikariCreationCount
pool.hikariCreationMaxMs
```

평균 보유 시간 방향:

```promql
1000
* sum(increase(hikaricp_connections_usage_seconds_sum{job="spring-app"}[$RANGE]))
/ clamp_min(sum(increase(hikaricp_connections_usage_seconds_count{job="spring-app"}[$RANGE])), 1)
```

보유 p95가 필요하면 perf 프로파일에만 다음 histogram을 켠다.

```properties
management.metrics.distribution.percentiles-histogram.hikaricp.connections.usage=true
management.metrics.distribution.minimum-expected-value.hikaricp.connections.usage=1ms
management.metrics.distribution.maximum-expected-value.hikaricp.connections.usage=30s
```

전 환경 공통 `application.properties`가 아니라 `application-perf.properties`에 두어 운영
시계열 증가를 피한다.

해석:

```text
acquire↑, usage 낮음   → 풀 자체가 작을 가능성
acquire↑, usage↑       → 긴 쿼리·긴 트랜잭션·트랜잭션 안 외부 호출 가능성
creation↑              → 커넥션 churn 또는 연결 불안정 가능성
```

### 5.5 컨테이너 OOM·메모리 제한 충돌

앱·MySQL·Redis 각각 다음을 저장한다.

```text
container.app.oomEvents
container.app.memoryFailCount
container.mysql.oomEvents
container.mysql.memoryFailCount
container.redis.oomEvents
container.redis.memoryFailCount
```

`oomEvents > 0`은 실행 실패 또는 최소한 비교 불가 사유다. `memoryFailCount > 0`은 메모리
제한 때문에 회수·할당 실패가 있었다는 직접 신호이므로 WARN 이상으로 취급한다.

컨테이너가 재생성되면 같은 `name`으로 여러 `id`가 잠시 존재할 수 있다. 현재 카탈로그의
`one()` 원칙과 동일하게 시계열 중복을 먼저 접고, 실행 중 컨테이너 재생성 자체는 별도
측정 무효 사유로 기록한다.

### 5.6 호스트 PSI

```text
host.psiCpuWaitingPct
host.psiIoWaitingPct
host.psiIoStalledPct
host.psiMemoryWaitingPct
host.psiMemoryStalledPct
```

방향:

```promql
100 * rate(node_pressure_cpu_waiting_seconds_total[$RANGE])
100 * rate(node_pressure_io_waiting_seconds_total[$RANGE])
100 * rate(node_pressure_memory_waiting_seconds_total[$RANGE])
```

PSI 는 **컨테이너 안 지표로는 보이지 않는 경합**을 유일하게 드러내는 축이다. 같은 조건인데
처리효율이 달라 보일 때 "호스트 바깥에서 누가 가져갔나"를 물을 수 있는 것이 이것뿐이므로,
일반적인 P2 가 아니라 P0/P1 수준으로 올린다.

### 5.7 디스크 응답시간과 큐

```text
host.diskReadAwaitMs
host.diskWriteAwaitMs
host.diskQueue.{avg,max,p95}
```

장치 이름 `sde` 등을 하드코딩하지 않는다. WSL2 재시작이나 마운트 상태에 따라 달라질 수 있다.
전체 활성 장치의 시간/완료 건수를 합산한 가중 평균을 사용한다.

```promql
1000
* sum(rate(node_disk_read_time_seconds_total[$RANGE]))
/ clamp_min(sum(rate(node_disk_reads_completed_total[$RANGE])), 0.0001)
```

쓰기 await도 같은 방식으로 계산한다. 작업 수가 0인 구간은 `0ms`인지 `측정 불가`인지 정책을
명시하고, 조용히 큰 값으로 만들지 않는다.

### 5.8 TCP 수락 실패

```text
host.tcpListenOverflows
host.tcpListenDrops
```

```promql
increase(node_netstat_TcpExt_ListenOverflows[$RANGE])
increase(node_netstat_TcpExt_ListenDrops[$RANGE])
```

둘 중 하나라도 증가하면 앱 로직에 도달하기 전에 요청이 손실된 것이다. 서버 p95와 k6 p95가
벌어질 때 가장 먼저 확인한다.

### 5.9 MySQL 쓰기·락 직접 신호

기존 `rowLockTimeMs`, `rowLockWaitCount`, `selectScan`, `selectFullJoin`, `tmpDiskTables`와
중복되지 않게 다음만 우선 추가한다.

```text
mysql.logWaits
mysql.bufferPoolWaitFree
mysql.tableLocksWaited
mysql.threadsCreated
mysql.readRndNext
mysql.fsyncs
mysql.logFsyncs
```

해석 원칙:

- `logWaits > 0`: redo log buffer 또는 로그 쓰기 대기 직접 신호
- `bufferPoolWaitFree > 0`: free page를 기다린 직접 신호
- `tableLocksWaited > 0`: 행 락이 아닌 테이블 락 대기
- `threadsCreated` 증가: 커넥션 재사용 실패/churn 후보
- `readRndNext`: 풀스캔이 실제로 읽은 행 규모의 대리 지표
- fsync 횟수: 양만으로 병목을 확정하지 않고 disk await·log wait와 함께 해석

`max_used_connections`는 서버 시작 이후 high-water mark라 실행 구간 귀속이 약하다. 기존
`threadsConnected.max`와 Hikari/Tomcat 포화도로 충분하므로 기본 카탈로그에는 추가하지 않는다.

---

## 6. `infra.attribution` 설계

### 6.1 현재 수집기 제약

`PromClient.instant()`는 여러 시계열을 `sum`, `max`, `min`, `first` 중 하나로 접어 숫자
하나만 반환한다. `collectInfra()`도 카탈로그 항목마다 이 숫자 하나를 `flat`에 넣는다.

따라서 `topk()`가 여러 URI를 반환해도 지금 구조에서는 라벨이 사라지고 숫자 하나만 남는다.
카탈로그에 쿼리 한 줄을 추가하는 것만으로는 귀속 정보가 보존되지 않는다.

### 6.2 권장 run.json 구조

```json
{
  "infra": {
    "flat": {
      "cpu.cores.max": 1.98,
      "logs.errorCount": 0
    },
    "attribution": {
      "endpoints": [],
      "repositories": [],
      "redisCommands": [],
      "scheduledJobs": []
    }
  }
}
```

`flat`은 기존 회귀 규칙의 안정성을 유지한다. `attribution`은 사람이 원인을 추적하는
진단 자료이며 처음에는 회귀 비교 대상에서 제외한다.

### 6.3 수집기 변경 방향

`PromClient`에 다음 성격의 메서드를 추가한다.

```text
instantVector(query, at)
→ [{ labels: { ... }, value: number }]
```

필수 동작:

- NaN/Inf 제거
- 예상 라벨만 allowlist로 보존
- 결과 수 상한 적용
- 동일 라벨 키 조합을 안정적으로 정렬
- Prometheus 오류 시 해당 attribution 배열만 빈 값으로 남기고 오류 기록
- `null`과 정상적인 빈 배열을 구분

### 6.4 엔드포인트

저장 형태:

```json
{
  "method": "GET",
  "uri": "/api/posts/{postId}",
  "requests": 8589,
  "errors5xx": 0,
  "serverP95Ms": 123.4,
  "serverMaxMs": 602.1
}
```

선정 규칙:

1. 요청 수 상위 10개
2. 총 서버 처리시간 상위 5개
3. 5xx가 발생한 URI 우선 포함
4. 중복 제거 후 최대 20~25개로 제한

보존 라벨은 `uri`, `method`만을 기본으로 한다. `status`, `outcome`은 오류 수 계산에만 쓰고
레코드 축으로 늘리지 않는다.

서버 p95는 다음 방향으로 계산한다.

```promql
histogram_quantile(
  0.95,
  sum by (le, uri, method) (
    rate(http_server_requests_seconds_bucket[$RANGE])
  )
)
```

주의:

- `클라이언트 p95 - 서버 p95`는 정확한 네트워크/큐 대기 p95가 아니다.
- 서로 다른 분위수의 차이는 병목 위치를 좁히는 방향성 지표로만 쓴다.
- URI는 현재 `/api/posts/{postId}`처럼 템플릿화되어 있지만, 새 엔드포인트가 원시 ID를
  라벨로 만들지 않는지 검증 테스트를 둔다.

### 6.5 Repository 메서드

저장 형태:

```json
{
  "repository": "PostReactionRepository",
  "method": "countByPostAndKindAndIsValidTrue",
  "calls": 736,
  "totalMs": 3069.87,
  "avgMs": 4.17,
  "maxMs": 18.2,
  "failures": 0
}
```

선정은 **총 실행시간 상위 10개**를 기본으로 하고 호출 수 상위 항목을 보완한다. N+1은
호출 수만으로 확정하지 않는다. `calls / k6 requests`, endpoint 비율, SQL digest를 함께 본다.

보존 라벨:

- `repository`
- `method`

`exception`, `state`는 실패 횟수로 접고 배열 라벨로 보존하지 않는다.

### 6.6 Redis 명령

저장 형태:

```json
{
  "command": "KEYS",
  "calls": 58,
  "totalMs": 12.3,
  "avgMs": 0.21,
  "maxMs": 1.8
}
```

선정:

- 총시간 상위 10개
- 호출 수 상위 10개
- `KEYS`, `FLUSHALL`, `FLUSHDB`, `EVAL` 등 위험 명령은 호출되면 우선 포함

`local`, `remote` 라벨은 IP·컨테이너 재생성에 따라 달라지므로 모두 `sum by(command)`으로
제거한다. 이 라벨을 저장하면 동일 실행 비교가 불필요하게 깨진다.

### 6.7 스케줄러

저장 형태:

```json
{
  "namespace": "com.example.highteenday_backend.schedulers.ViewCountScheduler",
  "function": "syncViewsToDB",
  "calls": 20,
  "totalMs": 240.0,
  "avgMs": 12.0,
  "maxMs": 35.0,
  "failures": 0
}
```

현재 perf 실행 중 실질적으로 반복 실행되는 작업은 조회수 동기화와 hot score 계산이다.
`tasks_scheduled_execution_seconds`를 기준으로 저장한다.

`executor_queued_tasks{name="messageBrokerTaskScheduler"}=5`는 배치 backlog로 해석하지 않는다.
WebSocket SimpleBroker가 미래에 실행할 heartbeat 작업 등이 예약 큐에 있는 정상 상태일 수 있다.
해당 값만으로 BTL-007 경고를 만들지 않는다.

스케줄러 풀 크기를 즉시 늘리지도 않는다. 단일 스레드는 작업을 직렬화해 DB 동시 부하를
줄이는 효과도 있다. 다음 순서로 판단한다.

1. 각 작업 실행시간 수집
2. 작업 주기보다 실행시간이 긴지 확인
3. 실제 시작 지연이나 겹침 확인
4. 필요한 경우에만 전용 `ThreadPoolTaskScheduler`와 풀 크기 실험

---

## 7. k6 요약 보완

### 7.1 dropped iterations

`breakpoint.js`는 `ramping-arrival-rate`를 사용하고 `dropped_iterations`가 증가하는 지점을
포화점으로 정의한다. 그런데 현재 `summary.js`는 이 값을 정규화된 결과에 저장하지 않는다.

추가:

```text
k6.all.droppedIterations
k6.all.droppedIterationRate
```

breakpoint는 `gatePhase:null`인 진단 시나리오이므로 `all` 저장이 우선이다. 향후
arrival-rate measure 구간을 도입하면 phase별 저장도 함께 추가한다.

`droppedIterations > 0`을 모든 시나리오의 공통 FAIL 규칙으로 만들지 않는다. breakpoint에서는
그 값 자체가 찾으려는 포화점이다. 시나리오별 해석 규칙으로 둔다.

### 7.2 sending·receiving

현재 전체 summary에는 waiting·blocked·connecting 일부만 있고, measure 구간에는 세부
분해가 없다. k6 remote-write에는 sending/receiving histogram이 이미 있으므로 다음 스칼라를
measure window로 수집한다.

```text
k6ts.sendingP95
k6ts.receivingP95
k6ts.connectingP95
```

기존:

```text
k6ts.waitingP95
k6ts.blockedP95
```

해석:

```text
waiting↑       서버 처리 또는 서버 앞 대기
blocked↑       부하 발생기의 연결 슬롯 대기
connecting↑    TCP 연결 문제
sending↑       큰 요청·업로드 또는 송신 문제
receiving↑     큰 응답 페이로드·수신 대역폭 문제
```

Prometheus 장애 뒤에도 실행 파일만으로 확인할 필요가 생기면 phase별 submetric을 k6 threshold
축에 선언해 `k6.phases.measure`에도 같은 값을 저장한다. 우선은 measure window와 일치하는
Prometheus 결과를 `run.json`에 고정하는 쪽이 변경 범위가 작다.

---

## 8. SQL digest와 심층 아티팩트

### 8.1 SQL digest는 매 실행 저장

`performance_schema.events_statements_summary_by_digest`를 사용한다.

흐름:

```text
perf-run 시작
→ readiness·데이터셋 검증 완료
→ digest 테이블 초기화
→ k6 실행
→ 종료 직후 상위 20개 조회
→ reports/runs/<runId>/artifacts/mysql-digests.json 저장
```

저장 필드:

```text
schema
digest
digestText
calls
totalMs
avgMs
rowsExamined
rowsSent
tmpDiskTables
sortMergePasses
```

`DIGEST_TEXT`는 리터럴이 `?`로 정규화된 형태를 사용해 토큰·이메일·게시글 내용 같은 값이
실행 기록에 들어가지 않게 한다. 텍스트 길이 상한도 둔다.

초기화 실패나 snapshot 실패는 처음에는 전체 성능 실행을 실패시키지 않고 artifact 오류로
기록한다. 반복적으로 안정성이 확인되면 정식 실험의 optional 측정 상태에 반영한다.

### 8.2 `info_schema.innodb_metrics`는 조건부

필요한 경우:

- BTL-003 hot row contention
- BTL-012 scrap toggle race/duplicate
- 데드락·history list·purge 지연 조사

기본 스크레이프 간격이 5초이므로 collector를 켜면 추가 MySQL 질의와 시계열 수가 계속
발생한다. 다음을 먼저 검증한다.

1. collector off/on에서 `/metrics` 응답 크기와 시계열 수
2. mysqld-exporter 스크레이프 시간
3. 유휴·부하 중 MySQL CPU 차이
4. Prometheus TSDB 증가량

검증 전에는 별도 Compose override 또는 환경 플래그로 경합 실험에서만 켠다.

### 8.3 대용량 아티팩트는 조건부

현재 JFR은 최대 200MB이고 앱 시작부터 계속 기록한다. 실행 디렉터리가 63개인 시점에 매
실행 200MB를 저장하면 JFR만 최대 약 12.6GB가 된다. 또한 파일이 개별 k6 실행 경계와 맞지
않는다.

권장 옵션:

```text
--artifacts never|on-failure|always
기본값: on-failure
```

수집 정책:

| 아티팩트 | 기본 정책 |
|---|---|
| SQL digest | 매 실행 |
| Redis SLOWLOG | WARN/FAIL 또는 Redis 진단 실행 |
| GC 로그 | WARN/FAIL 또는 `--artifacts always` |
| MySQL slow log | WARN/FAIL 또는 DB 쓰기/쿼리 실험 |
| JFR | WARN/FAIL 또는 명시적 프로파일링 실행 |

추가 조건:

- 실행별 시간 범위를 manifest에 기록한다.
- 파일별 크기와 SHA-256을 manifest에 저장한다.
- 최근 N개 또는 총용량 상한으로 보존한다.
- Git에는 JFR·GC·slow log 원문을 올리지 않는다.
- 현재 runtime 이미지는 JRE라 안정적인 `jcmd JFR.dump`를 바로 쓸 수 없다. JFR 자동
  snapshot 구현 전에 perf 전용 JDK runtime 또는 다른 안전한 dump 방법을 결정한다.

단순 `docker cp /tmp/perf.jfr`만 자동화하면 녹화 중인 파일과 실행 경계 문제가 남으므로
완료로 보지 않는다.

---

## 9. 기본 카탈로그에 넣지 않을 것

### 9.1 `messageBrokerTaskScheduler` queue를 배치 backlog로 해석

적용하지 않는다. 이 executor는 WebSocket broker 작업용이고, 예약된 미래 작업 수도 큐에
포함될 수 있다. `queued=5`만으로 조회수·hot score 배치가 밀렸다고 할 수 없다.

### 9.2 모든 HTTP 라벨 조합 영구 저장

적용하지 않는다. URI·method·status·outcome 전체 조합은 파일 크기와 스키마 변동을 키운다.
상위 N개와 5xx 우선 포함 정책을 사용한다.

### 9.3 raw error/KEYS 누적값 저장

적용하지 않는다. 앱 재시작 시 초기화되고 이전 실행이 섞인다. measure 구간 `increase()`만
저장한다.

### 9.4 `client p95 - server p95`를 정확한 네트워크 시간으로 저장

적용하지 않는다. 서로 다른 요청 분포의 분위수를 뺀 값은 개별 요청의 네트워크 시간 p95가
아니다. 리포트에서 방향성 설명만 제공한다.

### 9.5 모든 새 지표를 즉시 게이트로 사용

적용하지 않는다. attribution은 원인 설명용이고, 정상 범위를 모른 상태에서 임계값을 만들면
경고만 많아진다.

---

## 10. 구현 순서

### 1단계 — 기존 스칼라 구조로 끝나는 항목

대상:

1. MySQL 메모리와 파생 포화도
2. Redis CPU limit·throttling·컨테이너 메모리와 파생 포화도
3. error/warn 증가량
4. Young/Full GC 분리
5. Hikari usage 평균·최대
6. 앱·MySQL·Redis OOM/memory fail
7. PSI·TCP Listen drop·disk await
8. k6 dropped/sending/receiving
9. MySQL 직접 신호 소수

필요 변경:

- `performance/tools/lib/metrics-catalog.js`
- `performance/tools/lib/regression.js`의 병목 가설
- `performance/regression/rules.json`은 직접 실패 신호만 신중하게 추가
- `performance/tools/lib/report.js`
- `performance/scripts/lib/summary.js`
- 관련 Node 테스트

이 단계에서는 기존 `infra.flat` 구조를 유지한다.

### 2단계 — 귀속 벡터

대상:

1. `PromClient.instantVector()`
2. `infra.attribution` 스키마
3. 엔드포인트 상위 N개
4. Repository 상위 N개
5. Redis 명령 상위 N개
6. 스케줄러 메서드
7. HTML·콘솔 리포트 귀속 섹션

필요 테스트:

- 라벨 allowlist
- 상한과 정렬
- 5xx 우선 포함
- 중복 라벨 집계
- 부분 실패 시 나머지 수집 유지
- 카디널리티 폭증 입력에서도 파일 크기 제한

### 3단계 — 실행별 SQL 근거

대상:

1. 시작 전 digest 초기화
2. 종료 후 상위 20개 JSON 저장
3. artifact manifest
4. 실패 시 부분 측정 표시

SQL digest는 JFR보다 먼저 구현한다. 저장 비용이 작고 쿼리 원인 규명 효과가 더 직접적이다.

### 4단계 — 조건부 심층 자료

대상:

1. `--artifacts` 정책
2. Redis SLOWLOG
3. GC/slow log
4. 안전한 JFR 실행별 dump
5. 용량·보존 정책
6. 경합 실험용 InnoDB metrics collector

---

## 11. 게이트 승격 정책

### 처음부터 강하게 취급 가능한 직접 신호

| 신호 | 초기 처리 |
|---|---|
| 컨테이너 OOM 증가 | FAIL 또는 실행 무효 |
| Hikari timeout 증가 | 기존처럼 FAIL 후보 |
| TCP ListenDrops/Overflows 증가 | FAIL/WARN, k6 오류와 함께 판단 |
| MySQL log waits 증가 | WARN, 쓰기 시나리오에서 강화 가능 |
| Redis eviction 증가 | 기존처럼 WARN/FAIL 후보 |

### 정상 분포를 먼저 모아야 하는 신호

- error/warn 로그 수
- Full GC 횟수
- Hikari usage 평균·최대·p95
- Repository calls/request
- Redis command calls/request
- scheduler max duration
- PSI
- disk await
- `read_rnd_next`

### 게이트로 쓰지 않는 진단 정보

- 엔드포인트·Repository·Redis 명령 top N 순위 자체
- SQL digest 순위 자체
- `messageBrokerTaskScheduler` 예약 큐 크기
- JFR·slow log 파일 크기

---

## 12. 검증 완료 조건

### 기능 검증

- 새 스칼라 키가 정상 실행에서 `null`이 아니라 기대값을 가진다.
- 정상적으로 사건이 0회인 카운터는 `0`, exporter 결측은 `null`로 구분된다.
- measure window와 k6 `phases.measure`가 같은 시간을 가리킨다.
- 컨테이너 재생성 직후 중복 시계열이 포화도 100% 초과를 만들지 않는다.
- `infra.attribution`은 정해진 결과 수 상한을 넘지 않는다.
- Redis `local`·`remote` 라벨이 실행 기록에 남지 않는다.
- SQL digest에 실제 이메일·토큰·게시글 본문 같은 리터럴이 없다.

### 의미 검증

다음 통제된 실험으로 각 지표가 실제 사건을 잡는지 확인한다.

| 사건 | 기대 지표 |
|---|---|
| MySQL CPU 제한 축소 | `mysql.throttledPct`, `saturation.mysqlCpuPct` 증가 |
| Redis CPU 제한 축소 | `redis.throttledPct`, `saturation.redisCpuPct` 증가 |
| 의도적 error 로그 1회 | `logs.errorCount=1` |
| Full GC 진단 실행 | `gc.fullCount`, `gc.fullPauseMaxMs` 증가 |
| 긴 트랜잭션 | Hikari usage 증가 뒤 pending/acquire 증가 |
| breakpoint 포화 | `droppedIterations` 증가 |
| 큰 응답 | `receivingP95` 증가 |
| Repository 반복 호출 | 해당 메서드 calls/request 증가 |
| Redis KEYS 제거 | attribution의 `KEYS` 호출 증가량 0 |
| 스케줄러 작업 지연 | 해당 scheduled function max/avg 증가 |

### 비용 검증

- 동일한 짧은 실행 전후 앱·MySQL·Prometheus CPU 차이를 기록한다.
- `/actuator/prometheus` 응답 크기와 스크레이프 시간을 비교한다.
- attribution이 추가된 `run.json` 크기를 기존 실행과 비교한다.
- 20회 실행을 가정한 Prometheus TSDB·artifact 저장량을 산정한다.

### 회귀 검증

- `npm test` 또는 `node performance/tools/test/all.js` 통과
- 과거 `run.json` 재수집 시 새 optional 지표 결측 때문에 판정이 바뀌지 않음
- attribution 수집 실패가 기존 스칼라 수집을 중단하지 않음
- 리포트가 `0`, `미측정`, `배열 없음`을 서로 다르게 표시

---

## 13. 구현 시 파일별 역할

| 파일 | 변경 역할 |
|---|---|
| `performance/tools/lib/metrics-catalog.js` | 저카디널리티 스칼라 지표와 파생 포화도 |
| `performance/tools/lib/promql.js` | 라벨을 보존하는 vector query 지원 |
| `performance/tools/collect.js` | `infra.attribution` 조립과 부분 실패 처리 |
| `performance/tools/lib/regression.js` | 직접 실패 신호와 병목 가설 |
| `performance/regression/rules.json` | 충분히 검증된 지표만 게이트 승격 |
| `performance/tools/lib/report.js` | attribution과 새 진단값 표시 |
| `performance/scripts/lib/summary.js` | dropped/sending/receiving 정규화 |
| `performance/tools/perf-run.js` | SQL digest 초기화·snapshot, 조건부 artifact orchestration |
| `performance/environment/docker-compose.perf.yml` | 조건부 exporter collector, artifact 전제 |
| `src/main/resources/application-perf.properties` | perf 전용 Hikari usage histogram |
| `performance/tools/test/*` | 스칼라·벡터·결측·상한·정렬 검증 |

애플리케이션의 Redis `KEYS` 제거는 측정 도구와 분리된 코드 변경으로 진행한다.

---

## 14. 최종 판단

이 확장은 단순히 지표 수를 늘리는 작업이 아니다. 완성해야 할 진단 연결은 다음이다.

```text
k6에서 느림 확인
    ↓
서버 처리인가, 연결·전송인가 구분
    ↓
어느 엔드포인트가 시간을 썼는가
    ↓
어느 Repository 또는 Redis 명령이 반복됐는가
    ↓
어느 SQL이 총 시간을 사용했는가
    ↓
그때 앱·DB·Redis·호스트 중 어느 자원이 실제로 막혔는가
```

따라서 필요한 것은 “110개 지표를 더 많은 지표로 바꾸기”가 아니다.

> **저비용 직접 신호는 `flat`에, 코드 위치를 알려주는 다중 시계열은 bounded
> `attribution`에, 무거운 원자료는 조건부 `artifacts`에 넣는 것**이 이 프로젝트에 맞는
> 적용 방식이다.
