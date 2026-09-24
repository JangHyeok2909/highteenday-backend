# 서킷 개방이 조회수 정산을 건너뛴 사례

> 상태: open — 정산 거절 1건 확인, 이중 반영은 미관측
> 영향도: medium — Redis 카운터가 남아 있으면 조회수가 중복 반영될 수 있음
> 발견 실행: `redis-crash-2026-09-17T06-14-24`
> 비교 실행: `redis-crash-2026-09-17T07-14-13` (서킷브레이커 없음)
> 관련: [Redis 장애 전파](redis-failure-cascade.md)의 조회수 유실 문제

## 요약

Redis 장애 주입 실행에서 조회수 배치가 증가분을 MySQL에 반영한 뒤, Redis 카운터를 차감하는
호출이 서킷브레이커에 거절됐다. `settleCounts` 폴백의 `reason=open`이 1건이고
`reason=error`는 0건이었다. Redis 명령이 실패한 것이 아니라 호출이 Redis에 도달하기 전에
거절된 경우다.

이번 실행에서는 Redis 재시작으로 카운터가 사라져 **조회수 이중 반영은 관측되지 않았다.**
Redis가 살아 있어 카운터가 남는 조건에서 같은 경로가 중복 반영으로 이어지는지는 별도
실험이 필요하다. 정산 호출을 서킷브레이커 대상에서 빼는 방안을 검토 중이며 아직 적용하지
않았다.

## 문제 개요와 영향

`ViewCountScheduler.syncViewsToDB()`는 실행이 끝난 뒤 60초를 기다려 다음 주기를 시작하며,
대기 중인 조회수를 다음 순서로 정산한다.

1. `peekPendingViewCounts()`로 Redis 증가분을 읽는다. 이때 카운터는 지우지 않는다.
2. 게시글마다 `postService.applyViewCount()`로 MySQL에 증가분을 반영한다.
3. `settleViewCounts(applied)`로 반영한 만큼 Redis 카운터를 `DECRBY` 한다.
4. 게시글마다 `hotPostService.updateLeaderboardDayScore()`로 랭킹 점수를 갱신한다.

3번이 빠지면 이미 MySQL에 반영한 증가분이 Redis에 남는다. 다음 주기가 그 값을 다시 읽으면
같은 증가분을 중복 반영할 수 있다. 이번 장애 주입 실행에서 확인된 것은 **정산 거절 1건**이다.
실제 서비스의 조회수 오류나 고객 영향은 이 문서로 확인하지 않았다.

이번 실행의 조회수 불변식은 유실 3,979건이었다(부하 발생기 기대 증가분 13,611건 − DB
증가분 9,632건). 이 전체 차이로 정산 거절 1건의 영향을 계산할 수는 없다. 실험 환경은 Redis
영속화를 끄고 실행했으며, `CONFIG GET` 결과 `save`는 빈 문자열, `appendonly`는 `no`였다.
`docker stop` 후 재시작한 Redis가 비어 있어 차감되지 않은 카운터도 사라졌다.

중복 반영 위험은 **Redis 카운터가 남아 있는데 서킷만 열린 경우**에 있다. Redis가 명령
타임아웃 100ms보다 느리게 응답하거나 GC 정지 등으로 일시적으로 지연되는 상황이 예다.
`wait-duration-in-open-state=5s`이므로 서킷이 열리면 최소 5초 동안 호출을 거절한다.
`post:views:{postId}`에는 [TTL이 없어](../../docs/architecture.md) 남은 값이 시간 경과만으로
없어지지도 않는다.
정산이 한 번 실패하고 다음 주기에 성공한다면 그 실패 회차의 증가분이 한 번 더 반영될 수 있다.
반복 실패 시 영향 범위는 이번 실행으로 판단할 수 없다.

## 탐지와 시간순 기록

`redis.fallback` 지표의 `reason` 태그가 단서였다. `open`은 서킷이 Redis 호출을 거절한
경우이고 `error`는 Redis에 호출을 보낸 뒤 실패한 경우다. 두 값을 구분하지 않았다면 정산
폴백 1건을 Redis 중단에 따른 일반적인 명령 실패로 읽었을 것이다.

| 순서 | 확인된 일 | 근거 |
|---|---|---|
| 주기 시작 | 서킷이 닫혀 있어 진입 가드를 통과 | 시작 시점의 서킷 상태와 이후 호출 경로 |
| 증가분 조회 | `peekPendingCounts` 폴백 없음 | fault 구간 `open` 0건, `error` 0건 |
| MySQL 반영 | 조회수 DB 증가 관측 | 조회수 불변식 계측 |
| 서킷 개방 | Redis 정지 후 서킷이 열렸다 | 첫 `open` 표본 06:15:39.379Z |
| Redis 정산 | `settleCounts` 호출 거절 | `open` **1건**, `error` **0건** |
| 랭킹 갱신 | 장애 구간의 `addScore` 폴백 발생 | `open` 1,439건, `error` 37건 |

Redis 중단 시각은 06:15:28.250Z, 재시작 시각은 06:16:24.392Z다. 5초 간격의 서킷 상태
표본에서 첫 `open`은 06:15:39.379Z, 마지막 `open`은 06:16:44.379Z였고 연속 14표본이
열린 상태였다. 실제 개방 시점은 중단 후 6.1~11.1초, 닫힌 시점은 재시작 후 20.0~25.0초
사이로 추정한다. 개별 DB 반영과 정산 호출의 정확한 시각은 수집하지 않았다.

서킷 상태는 실행 기록인 `run.json`에 없다. 위 시간은 Prometheus에 직접 질의한 값이다.
`increase()` 질의가 정산 거절을 1.1건으로 표시하는 것은 구간 경계 외삽 때문이며,
실제 사건 수는 1건이다.

## 원인과 촉발 요인

**직접 원인:** MySQL 반영 뒤 반드시 수행해야 하는 `settleCounts`도
`ResilientRedisExecutor`의 서킷 거절 대상이다. 서킷이 열린 동안 이 호출은 Redis에
도달하지 못한다. `reason=open` 1건이 이 거절을 확인한다.

**촉발 조건:** 배치 시작 시점에는 서킷이 닫혀 있었지만, MySQL 반영 반복문이 도는 사이에
Redis 장애 중 서킷이 열렸다. `syncViewsToDB()`의 `redisExecutor.isOpen()` 가드는 주기 시작
때 한 번만 검사한다. 3번 직전에 다시 검사하더라도 이미 끝난 MySQL 반영을 되돌릴 수는 없다.

이 실행의 `addScore` 호출 중 1,439건이 서킷 개방으로 거절됐다. 그중
`HotScoreScheduler`가 주기당 최대 50건을 담당하므로 조회수 배치가 처리한 게시글은 약
1,389건으로 추정한다. 게시글마다 MySQL 쓰기 트랜잭션을 여는 긴 반복문이 서킷 상태가
바뀔 시간을 만들었다. 이 수는 직접 센 조회수 배치 처리 건수가 아니다.

서킷이 없는 비교 실행에서는 `peekPendingCounts` 폴백이 1건, `settleCounts` 폴백이
0건이었다. 조회 단계에서 실패해 MySQL 반영과 정산 단계에 도달하지 못한 것이다.
`redis-crash-2026-09-14T05-22-34` 기준선도 같은 모양이다. 이 비교만으로 두 실행의
차이를 서킷 도입 효과로 단정할 수는 없다. 배치가 Redis 중단 시각을 기준으로 언제
시작했는지도 다를 수 있다. 다만 발견 실행의 정산 호출을 **서킷이 거절했다는 사실**은
`reason=open`으로 확인된다.

## 조치와 검증 계획

**제안한 조치:** `settleCounts`를 서킷브레이커 대상에서 뺀다. MySQL에 반영한 뒤의 차감은
남은 Redis 증가분을 없애는 정산 작업이다. 서킷이 열렸어도 Redis가 실제로 응답한다면
차감을 시도할 수 있어야 한다. 호출이 실패할 때의 예외 처리는 유지해 배치가 중단되지 않게
한다. 이 조치는 서킷 거절 문제를 겨냥하며, Redis가 실제로 중단된 동안의 정산 실패까지
해결하지는 못한다. 호출 한 번의 대기 상한은 명령 타임아웃 100ms다.

검토한 다른 방법은 다음과 같다.

- **Redis 차감을 MySQL 반영보다 먼저 한다:** MySQL 반영이 실패하면 증가분이 유실된다.
  이전 구현에서 겪은 문제여서 현재 순서로 바꿨다.
- **정산을 멱등하게 만든다:** 배치 식별자로 중복 반영을 막을 수 있지만 추가 상태와 구현이
  필요하다. 정합성 요구가 높아지면 다시 검토할 대안이다.

변경 후에는 정산 호출에서 `reason=open` 폴백이 더 이상 나오지 않는지 확인한다. 이중
반영 가능성은 Redis를 재시작하지 않고 느리게 만들어 서킷만 여는 실험으로 검증한다.
특정 게시글의 Redis 대기 증가분과 MySQL 조회수를 두 번의 정산 주기 전후에 직접 비교해야
한다. 전체 요청의 기대 증가분과 DB 증가분만 비교하면 다른 조회수 유실이 중복 반영을
가릴 수 있다. 이 조건에서 정산이 거절돼 카운터가 남았는데도 다음 주기에 같은 증가분이
다시 반영되지 않는다면 중복 반영 가설을 수정해야 한다.

## 배운 점과 남은 위험

- 폴백을 `error`와 `open`으로 나눈 지표 덕분에 Redis 명령 실패와 서킷 거절을 구별했다.
- 장애 주입기의 `run.json`에는 서킷 상태와 전이가 없어, 같은 판단을 원자료만으로
  재현할 수 없다.
- Redis 영속화를 끈 이번 실험은 **정산 거절 조건**은 보였지만 **이중 반영 피해**는
  보여 주지 못했다.

## 후속 조치

| 할 일 | 목적 | 상태 |
|---|---|---|
| `settleCounts`를 `ResilientRedisExecutor` 밖으로 분리 | 서킷만 열린 경우에도 정산 시도 | 미적용 |
| `redis-slow` 계획에서 게시글별 두 주기 조회수 비교 | 카운터가 남을 때 중복 반영 여부 확인 | 미실행 |
| `performance/resilience/lib/faultmetrics.js`에서 서킷 상태·전이 수집, `lib/report.js` 7절에 표시 | 실행 원자료만으로 경로 재구성 | 미적용 |

## 근거

- 발견 실행: [report.html](../resilience/reports/redis-crash-2026-09-17T06-14-24/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-17T06-14-24/run.json)
- 비교 실행: [report.html](../resilience/reports/redis-crash-2026-09-17T07-14-13/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-17T07-14-13/run.json)
- 서킷 지표는 `run.json`에 없어 다음 Prometheus 질의로 확인했다.

  ```promql
  sum by (reason) (increase(redis_fallback_total{job="spring-app",method="RedisViewCountStore.settleCounts"}[60s]))
  resilience4j_circuitbreaker_state{job="spring-app",name="redis",state="open"}
  ```

- 관련 코드: `ViewCountScheduler`, `RedisViewCountStore.settleCounts`,
  `ResilientRedisExecutor`, `RedisFallbackMetrics`
