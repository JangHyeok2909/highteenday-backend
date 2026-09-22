# Circuit open skips view count settlement

> 상태: open
> 영향도: medium (조회수가 영구히 부풀어 오르지만 증가분은 실패한 정산 1회분으로 제한된다)
> 발견 실행: `redis-crash-2026-09-17T06-14-24`
> 관련: [Redis failure cascade](redis-failure-cascade.md)의 "남은 것" 중 조회수 유실 항목

## 결론

Redis 서킷브레이커를 넣은 뒤, 조회수 배치가 **MySQL에 증가분을 쓰고 나서 Redis 카운터를
차감하지 못한 채 끝나는** 경우가 생겼다. 차감이 빠진 이유는 Redis에 도달하지 못해서가
아니라 **서킷이 열려 있어 호출을 거절했기 때문**이다.

차감이 빠지면 Redis에 증가분이 그대로 남고, 다음 주기가 같은 증가분을 MySQL에 한 번 더
더한다. 조회수가 실제보다 커지고, 응답도 오류도 로그도 남지 않는다.

`redis-crash-2026-09-17T06-14-24` 실행에서 이 조건이 1회 발생했다. 다만 이 실행에서는
피해가 나타나지 않았다. 아래 "이번 실행이 증명하지 못한 것"에 이유를 적었다.

## 무엇이 일어났나

`ViewCountScheduler.syncViewsToDB()`는 60초마다 돌고 순서가 이렇다.

1. `peekPendingViewCounts()` — Redis에서 대기 중인 증가분을 읽는다(지우지 않는다)
2. 게시글마다 `postService.applyViewCount()` — **MySQL에 증가분을 쓴다**
3. `settleViewCounts(applied)` — 반영한 만큼 Redis 카운터를 DECRBY 한다
4. 게시글마다 `hotPostService.updateLeaderboardDayScore()` — 랭킹 점수를 갱신한다

관측된 실행 순서는 이랬다.

| 단계 | 관측 | 근거 |
|---|---|---|
| 주기 시작 | 서킷이 닫혀 있어 진입 가드를 통과 | 아래 서킷 시계열에서 이 시점은 `closed` |
| 1. peek | **성공** | `peekPendingCounts` 폴백 open 0건 · error 0건 |
| 2. MySQL 반영 | 성공 | 유실 계측의 DB 조회수가 실제로 증가 |
| (이 사이) | 웹 트래픽이 서킷을 열었다 | 서킷이 06:15:39 이전에 OPEN 으로 전이 |
| 3. settle | **거절됨** | `settleCounts` 폴백 **open 1건 · error 0건** |
| 4. 랭킹 갱신 | 전부 거절됨 | `addScore` 폴백 open 1,439건 · error 37건 |

결정적인 수치는 3번이다. `RedisViewCountStore.settleCounts`의 fault 구간 폴백이
`reason=open` 1건, `reason=error` 0건이다. `open`은 서킷이 호출을 보내지도 않고 거절했다는
뜻이고, `error`는 Redis에 보냈다가 실패했다는 뜻이다. error가 0이므로 **Redis 도달 실패가
아니라 서킷의 거절**이 원인이다.

(Prometheus `increase()`는 구간 경계에서 값을 외삽하므로 질의 결과는 1.1로 나온다.
실제 건수는 1이다.)

### 서킷이 열려 있던 구간

`resilience4j_circuitbreaker_state{name="redis",state="open"}`을 5초 간격으로 읽으면
연속 14표본이 1이다. 14 × 5초 = **70초**다.

- `docker stop perf-redis` 실제 시각 06:15:28.250Z
- 첫 `open` 표본 06:15:39.379Z → 정지 후 11.1초 이내에 열렸다. 표본 간격이 5초이므로 실제
  개방 시점은 정지 후 6.1초에서 11.1초 사이다.
- `docker start` 06:16:24.392Z, 마지막 `open` 표본 06:16:44.379Z → 재시작 20.0초에서
  25.0초 사이에 닫혔다.

이 지표는 실행 기록(`run.json`)에 없다. 하네스가 아직 서킷 지표를 수집하지 않아 Prometheus에
직접 질의해 얻은 값이다.

## 왜 진입 가드로 막히지 않나

`syncViewsToDB()` 앞에 `redisExecutor.isOpen()`이면 주기를 건너뛰는 가드가 있다. 이 가드는
**주기 시작 시점 한 번만** 본다. 위 실행에서 주기는 서킷이 닫힌 상태로 시작했고, 2번의
MySQL 반영이 도는 동안 웹 트래픽이 서킷을 열었다.

반영 반복문의 길이가 노출 시간을 정한다. 이 실행에서 4번 랭킹 갱신이 1,439건 호출됐고
그중 `HotScoreScheduler`가 주기당 최대 50건을 담당하므로, 조회수 배치가 처리한 게시글은
약 1,389건이다. 게시글마다 MySQL 쓰기 트랜잭션이 하나씩 열리므로 반복문이 도는 동안
서킷이 열릴 시간이 충분했다.

3번 직전에 `isOpen()`을 한 번 더 확인해도 소용이 없다. 그 시점에는 MySQL에 이미 썼기
때문에, 열려 있다고 해서 되돌릴 수 있는 것이 없다.

### 서킷 없는 대조군에서는 이 경로를 밟지 않았다

같은 환경에서 서킷브레이커만 뺀 대조군(`redis-crash-2026-09-17T07-14-13`)의 fault 구간
폴백은 `peekPendingCounts` 1건, `settleCounts` 0건이다. 1번에서 실패해 주기가 그 자리에서
끝났으므로 2번 MySQL 반영 자체가 없었고, 그래서 차감이 빠질 일도 없었다. 09-14 기준선
(`redis-crash-2026-09-14T05-22-34`)도 같은 모양이다 — `peekPendingCounts` 1건,
`settleCounts` 0건.

서킷 실행에서만 반대로 나왔다(`peekPendingCounts` 0건, `settleCounts` 1건). 주기가 Redis
정지 시각의 어느 쪽에서 시작했는지가 갈랐을 가능성이 크지만, 실행 3건으로는 타이밍 차이인지
서킷이 만든 차이인지 가릴 수 없다. 확실한 것은 **주기가 1번을 통과한 경우 차감을 막은 것이
서킷이라는 사실**이고, 그 근거가 `settleCounts` 폴백의 `reason=open`이다.

## 이번 실행이 증명하지 못한 것

**이중 반영은 일어나지 않았다.** perf 환경의 Redis는 영속화를 끄고 돈다. 실행 중
`CONFIG GET`으로 확인한 값이 `save`는 빈 문자열, `appendonly`는 `no`다. `docker stop` →
`docker start` 로 재시작한 Redis는 비어 있으므로, 차감되지 않고 남아 있던 증가분도 함께
사라졌다. 다음 주기가 다시 더할 대상이 없었다.

즉 이 실행은 **조건이 성립한다는 것**은 보였지만 **피해가 난다는 것**은 보이지 않았다.

조회수 불변식은 유실 3,979건으로 나왔다(부하 발생기 기대 13,611건 − DB 증가분 9,632건).
이중 반영이 있었다면 이 차이가 줄었겠지만, 재시작으로 카운터가 사라졌으므로 이 수치로는
이중 반영 여부를 판정할 수 없다.

## 언제 피해가 나타나나

**Redis가 살아 있는데 서킷만 열린 경우**다. 그때는 차감되지 않은 증가분이 Redis에 그대로
남아 다음 주기에 다시 MySQL로 간다. 해당하는 상황은 둘이다.

- `redis-slow` 처럼 Redis가 응답은 하는데 명령 타임아웃(`spring.data.redis.timeout=100ms`)을
  넘겨 실패율이 올라가는 경우
- Redis 쪽 GC 정지나 AOF 재작성 같은 짧은 지연으로 서킷이 열리는 경우.
  `wait-duration-in-open-state=5s` 이므로 한 번 열리면 최소 5초는 거절이 이어진다

증가 폭은 **실패한 정산 1회분**으로 제한된다. 다음 주기의 정산이 성공하면 그 시점의 잔여
카운터가 차감되므로 그 이상 누적되지는 않는다. 다만 이미 MySQL에 들어간 중복분은 되돌아오지
않는다. `post:views:{postId}` 키에는 TTL이 없어(`docs/architecture.md`의 키 표) 시간이
지난다고 저절로 사라지지도 않는다.

## 이 문제를 어떻게 보게 됐나

`redis.fallback` 지표에 `reason` 태그(`error`, `open`)를 붙여 둔 것이 유일한 단서였다.
태그가 없었다면 `settleCounts` 폴백 1건만 보였을 것이고, 그건 "Redis가 죽었으니 차감도
실패했다 — 어쩔 수 없다"로 읽혔을 것이다. 두 값을 갈라 놓았기 때문에 **Redis는 닿을 수
있었는데 우리 쪽 서킷이 막았다**는 것이 드러났다.

## 고치는 방법

**권장: `settleCounts`를 서킷 밖으로 뺀다.** 차감은 이미 MySQL에 커밋한 작업을 되돌리는
보상 연산이다. 서킷브레이커가 아끼는 것은 호출당 최대 100ms(명령 타임아웃)의 대기 한 번이고,
차감을 건너뛰어 잃는 것은 되돌릴 수 없는 조회수 오차다. 보상 연산은 서킷에 태우지 않는다.
Redis가 진짜 죽었으면 어차피 실패하지만, 이번처럼 서킷만 열린 경우에는 성공한다.

대안 둘은 채택하지 않는 이유와 함께 적어 둔다.

- **순서를 뒤집어 차감을 먼저 한다** — 실패 시 이중 반영 대신 유실이 된다.
  `ViewCountScheduler` 클래스 주석이 기록하듯 예전 구현이 그 순서였고, 반영이 실패하면
  이미 지워진 증가분을 복구할 수 없어서 지금 순서로 바꿨다. 되돌리면 그 문제가 돌아온다.
- **정산을 멱등하게 만든다** — 반영한 배치에 식별자를 붙여 중복 적용을 막는다. 정확하지만
  Redis에 상태를 하나 더 두는 변경이라 이 문제 하나를 고치려고 치르기에는 크다.

## 반증 조건

- `settleCounts`를 서킷에서 뺐는데도 `reason=open` 폴백이 남으면, 차감을 막는 경로가
  서킷 말고 또 있다는 뜻이다.
- Redis가 살아 있는 상태로 서킷만 여는 실행(`redis-slow`)에서 DB 조회수가 부하 발생기의
  기대 증가분을 넘지 않으면, 이중 반영 가설이 틀린 것이다.
- 정산이 실패한 다음 주기에 조회수가 더 늘지 않으면, "증가 폭은 실패한 정산 1회분"이라는
  설명이 틀린 것이다.

## 다음

1. `settleCounts`를 `ResilientRedisExecutor` 밖으로 뺀다. 예외는 그대로 잡아 배치가
   죽지 않게 하되, 서킷의 거절 대상에서는 제외한다.
2. `redis-slow` 계획으로 재현한다. Redis가 살아 있어야 이중 반영이 실제로 관측된다.
   조회수 불변식이 유실이 아니라 **초과**로 나오는지 본다.
3. 하네스가 서킷 상태와 전이를 수집하게 한다. 지금은 `run.json`에 없어서 이 문서의 수치를
   Prometheus에 직접 질의해야 했다. 수집 지점은 `performance/resilience/lib/faultmetrics.js`,
   표시 지점은 `lib/report.js`의 7절이다.

## 원자료

- 발견 실행: [report.html](../resilience/reports/redis-crash-2026-09-17T06-14-24/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-17T06-14-24/run.json)
- 서킷 지표는 `run.json`에 없다. 질의는 아래와 같다.
  ```
  sum by (reason) (increase(redis_fallback_total{job="spring-app",method="RedisViewCountStore.settleCounts"}[60s]))
  resilience4j_circuitbreaker_state{job="spring-app",name="redis",state="open"}
  ```
- 관련 코드: `ViewCountScheduler`, `RedisViewCountStore.settleCounts`,
  `ResilientRedisExecutor`, `RedisFallbackMetrics`
