# Redis failure cascade

> 상태: fixed (잔여 문제는 아래 "남은 것")
> 영향도: critical
> Before 실행: `redis-crash-2026-09-11T06-06-22`
> After 실행: `redis-crash-2026-09-11T06-15-49`

## 결론

Redis를 60초 중단했을 때 앱 전체가 멈춘 원인은 Lettuce 명령 타임아웃이 지정되지 않아
기본값 60초가 적용된 것이었다. 요청 하나가 Redis 응답을 60초 기다리는 동안 Tomcat 스레드를
붙잡고, 그 호출이 트랜잭션 안이면 HikariCP 커넥션까지 함께 붙잡았다. 커넥션 10개가 모두
그렇게 묶이자 Redis를 쓰지 않는 기능과 인증까지 실패했다.

`spring.data.redis.timeout`을 200ms로 지정하자 같은 장애에서 오류율이 31.75%에서 0%로,
장애 구간 p95가 60,003ms에서 973ms로 내려갔다. 풀 포화는 사라졌다. HikariCP pending은
최대 145개에서 0개가 됐다.

남은 문제는 둘이다. 조회수가 조용히 사라지는 양이 오히려 늘었고, `/actuator/health`는
앱이 정상 응답하는 동안 DOWN을 보고한다.

## Before와 After

두 실행은 같은 앱 이미지 계보(같은 Dockerfile, 소스와 일치), 같은 데이터셋(medium,
지문 24ddff07519b), 같은 부하(도착률 4/s, pre 90초·fault 60초·post 60초), 같은 캐시 초기
상태(실행기가 FLUSHALL로 비운 뒤 시작)에서 돌았다. 바뀐 것은 아래 "무엇을 바꿨나"뿐이다.

| 지표 | Before | After | 읽는 법 |
|---|---:|---:|---|
| fault 오류율 | 31.75% | 0.00% | 장애 60초 동안 4xx·5xx·무응답 비율 |
| fault 완료 요청 | 274건 | 982건 | 같은 60초에 끝난 요청 수. 3.58배 |
| fault p95 | 60,003ms | 973ms | 61.7배 단축 |
| fault 최대 지연 | 60,007ms | 2,727ms | |
| 실패 상태 분포 | 무응답 31 · 401 38 · 500 18 | 없음 | |
| Tomcat busy 최대 | 177개 | 4개 | 400개 중 |
| HikariCP pending 최대 | 145개 | 0개 | 커넥션을 기다리는 스레드 수 |
| HikariCP active 최대 | 10/10 | 3/10 | Before는 풀 전체가 묶였다 |
| MySQL threads_running | 2개 | 2개 | 둘 다 낮다. 아래 설명 참고 |
| health 응답 | 12/12 4초 안에 응답 못 함 | 12/12 DOWN(503), p50 267ms | |
| post p95 | 6,284ms | 435ms | 복구 직후 빈 캐시 비용 |
| 조회수 유실 | 160건 | 481건 | 늘었다. 아래 "남은 것" |

**MySQL threads_running이 양쪽 다 낮은 것이 진단의 핵심이다.** Before에서 커넥션 10개가
모두 쓰이는 동안(active 10/10) MySQL이 실제로 실행한 쿼리는 2개뿐이었다. 커넥션을 쥔
스레드들이 DB 작업을 하고 있었던 것이 아니라 Redis 응답을 기다리고 있었다는 뜻이다.

트랜잭션 내에서 Redis 작업이 실행되기에 redis에 타임아웃만큼 커넥션풀을 점유한 채로 기다려 이런 문제가 발생했다.

## 무엇을 바꿨나

1. **Redis 명령·접속 타임아웃 명시** — `spring.data.redis.timeout=200ms`,
   `spring.data.redis.connect-timeout=500ms`. 200ms의 근거는 Before 실행 정상 구간(90초)의
   클라이언트 측 명령 지연이다. p50 0.127ms, p99 0.570ms, p99.9 1.647ms였고 관측 최댓값은
   44.2ms였다. 최댓값은 같은 구간 GC pause 최댓값 47.0ms와 크기가 같아 명령 위에 pause가
   겹친 표본으로 본다. 여유는 명령 꼬리값과 pause를 더한 48.6ms에 대해 200 ÷ 48.6 = 4.1배다.
2. **인프라 실패와 인증 실패의 상태 코드 분리** — `TokenAuthenticationFilter`가 JWT 검증
   실패는 종전대로 삼키고 익명으로 넘기되, DB·Redis 때문에 판정을 못 한 경우
   (`TransientDataAccessException`, `DataAccessResourceFailureException`,
   `TransactionException`)는 `INFRASTRUCTURE_UNAVAILABLE`로 끊는다. 같은 세 타입을
   `GlobalExceptionHandler`도 503으로 매핑한다. 재시도해도 같은 결과인
   `NonTransientDataAccessException`(문법이 틀린 SQL 등)은 500으로 남긴다.

## 이번 실행이 증명하지 못한 것

**2번 변경은 이 실행에서 실행되지 않았다.** 타임아웃을 줄이자 풀이 포화되지 않았고,
그래서 인증 경로의 DB 조회가 실패할 일 자체가 없었다. 
Before의 401 38건은 503으로 바뀐 것이 아니라 사라졌다. 
두 변경은 서로 다른 층에 있다. 타임아웃은 장애가 번지는 것을 막고, 
상태 코드 분리는 그래도 인프라 실패가 났을 때 클라이언트가 오해하지 않게 한다.

상태 코드 분리는 테스트로만 고정돼 있다. `AuthInfrastructureFailureStatusTest`가 보호
경로에 같은 요청을 보내며 예외 종류만 바꿔 401과 503이 갈리는지 확인하고,
`GlobalExceptionHandlerTest.InfrastructureVersusBug`가 503과 500의 경계를 확인한다.
장애 주입으로 이 경로를 밟으려면 MySQL을 직접 느리게 하는 계획(`mysql-slow.json`)이 필요하다.

## 남은 것

**조회수 유실이 3배로 늘었다.** Before 160건, After 481건이다. 계산은
`부하 발생기가 센 기대 증가분 − DB 조회수 실제 증가분`이고, Before는 794 − 634 = 160,
After는 811 − 330 = 481이다. 늘어난 이유는 고쳐서 나빠진 것이 아니라 완료된 요청이
274건에서 982건으로 3.58배 늘었기 때문이다. 요청당 유실 비율은 0.58에서 0.49로 오히려
낮아졌다. Before에서는 요청이 60초 동안 매달려 조회수 증가 자체에 도달하지 못했고,
After에서는 도달한 뒤 `@ResilientRedis`가 INCR 실패를 삼켰다. 응답은 양쪽 다 200이다.
유실을 허용 범위로 받아들일지, DB 원장에 쌓아 복구할지는 아직 정하지 않았다.

**헬스가 여전히 장애를 전면화한다.** Before에서는 헬스 응답이 4초 안에 오지 않았고
(폴러 상한 4,000ms), After에서는 267ms 만에 DOWN(503)을 응답한다. 관측은 좋아졌지만
로드밸런서 입장에서는 둘 다 "이 인스턴스를 빼라"다. 앱이 폴백으로 정상 응답하는 동안
Redis 하나 때문에 인스턴스가 빠지면 부분 저하가 전면 장애가 된다. Redis를 readiness에서
빼는 변경은 아직 하지 않았다.

**post 구간 RPS는 "미회복"으로 표시됐지만 회복 실패로 읽지 않는다.** 판정 기준은 pre
중앙값 15.02/s의 대역 안에 30초 연속 머무는 것인데, After의 post 구간은 60초뿐이고 그
끝이 부하 종료와 겹쳐 마지막 표본들이 12.0 → 10.9 → 9.2 → 5.9 → 3.7 → 1.4/s로 단조
감소한다. 부하 발생기가 멈추는 구간을 30초 이동창이 따라 내려온 것이다. Before가 이
조건을 채운 것은 밀렸던 요청이 post 내내 풀리며 RPS를 pre보다 높게 유지했기 때문이고,
더 건강해서가 아니다.

## 반증 조건

- 타임아웃을 200ms로 둔 채 실패가 다시 60초에 몰리면 타임아웃 설명이 틀린 것이다.
- 같은 부하에서 HikariCP pending이 다시 쌓이면 Redis 외에 커넥션을 오래 쥐는 경로가 있다.
- MySQL을 느리게 했을 때 인프라 에러가 아닌 401이 남으면 상태 코드 분리가 그 경로를 덮지 못한 것이다.

## 다음

1. 조회수 유실의 허용 범위와 복구 정책을 정한다. 정하기 전에는 `@ResilientRedis`가 삼킨
   쓰기 실패의 건수를 지표로 남겨 유실이 보이게 한다.
2. Redis를 readiness 그룹에서 뺀다. 원본(DB)만 readiness로 둔다.
3. `mysql-slow.json`·`mysql-hang.json`으로 DB 쪽 실패 지연과 503 경로를 함께 측정한다.

## 원자료

- Before: [report.html](../resilience/reports/redis-crash-2026-09-11T06-06-22/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-11T06-06-22/run.json)
- After: [report.html](../resilience/reports/redis-crash-2026-09-11T06-15-49/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-11T06-15-49/run.json)
- 바뀐 코드: `application.properties`, `TokenAuthenticationFilter`, `TokenExceptionFilter`,
  `GlobalExceptionHandler`, `ErrorCode`
