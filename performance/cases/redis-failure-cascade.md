# Redis 장애가 앱 전체로 전파된 사례

> 상태: fixed — 60초 Redis 대기로 인한 전면 지연은 변경 후 실행에서 해소
> 영향도: critical
> 변경 전 실행: `redis-crash-2026-09-11T06-06-22`
> 변경 후 실행: `redis-crash-2026-09-11T06-15-49` (200ms), `redis-crash-2026-09-11T06-37-20` (100ms)

## 요약

Redis를 60초 중단한 변경 전 실행에서 명령 타임아웃이 지정되지 않아 요청이 최대 60초까지
기다렸다. 장애 구간의 오류율은 31.75%, p95는 60,003ms였고 Tomcat 스레드와 MySQL
커넥션 풀이 함께 포화됐다. 당시 명령 타임아웃을 200ms로 지정한 뒤 같은 장애 주입에서
오류율은 0%, p95는 973ms, 장애 구간 HikariCP pending 최대는 127개에서 0개가 됐다.
같은 조건에서 타임아웃을 100ms로 줄인 실행의 p95는 224ms였다.

이 비교는 **긴 Redis 대기를 끊으면 전면 지연이 사라진다**는 것을 보여 준다. 커넥션이
정확히 어떤 경로에서 반납되지 않았는지는 이 실행으로 확정하지 않았다. 조회수 유실과
`/actuator/health`의 DOWN 응답도 변경 후 실행에 남았다. 각각
[조회수 유실](redis-viewcount-loss-on-fallback.md)과
[헬스 판정](redis-health-readiness.md) Case에서 다룬다.

## 문제 개요와 영향

장애 주입기는 Redis를 60초 중단했다. 변경 전에는 Redis 호출을 기다리는 요청이 끝나지
않았고, Redis를 직접 쓰지 않는 기능과 보호 API까지 실패했다. 장애 구간에 무응답 31건,
401 38건, 500 18건이 기록됐다. fault 구간 집계에서 Tomcat busy는 최대 158/400,
HikariCP active는 최대 10/10, 커넥션 획득 대기인 pending은 최대 127개였다.

두 실행은 같은 Dockerfile과 소스에 맞는 앱 이미지 계보, 같은 medium 데이터셋
(지문 `24ddff07519b`), 같은 도착률 4/s, 같은 pre 90초·fault 60초·post 60초,
같은 캐시 초기 상태에서 진행했다. 실행기는 시작 전 Redis를 `FLUSHALL`로 비웠다.
비교하는 코드 변경은 아래의 명령·접속 타임아웃과 오류 상태 코드 처리다.
100ms 실행도 이 조건과 데이터셋 지문이 같다. 실행별 완료 요청 수는 지연 때문에 달라
조회수 유실 건수를 타임아웃 변경의 효과로 직접 비교하지 않는다.

## 탐지와 전파 경로

변경 전 fault 구간의 p95 60,003ms와 최대 지연 60,007ms가 Redis 명령 대기 상한에
붙었다. 같은 구간에 Tomcat busy, HikariCP active와 pending이 함께 상승했다.
MySQL `threads_running`은 2개로 낮았다. 풀의 커넥션 10개가 모두 사용 중이었지만
MySQL에서 실행 중인 작업은 적었다. DB 쿼리 실행량만으로 풀 점유를 설명하기 어렵다.

관측된 전파는 **Redis 응답 대기 → 요청 스레드 장시간 점유 → 커넥션 풀 점유와 대기 증가
→ 다른 요청의 지연·실패**다. 다만 모든 커넥션을 `@Transactional` 경로가 붙잡았다고
단정할 수 없다. 뒤의 [커넥션 점유 조사](db-connection-held-during-redis-wait.md)는
트랜잭션 밖 Redis 호출도 많고 OSIV 가능성이 남는다고 기록했다. 그 Case의 9월 17일
실행은 부하와 풀 크기가 달라 커넥션 점유의 세부 원인을 직접 가르는 대조 실험이 아니다.

## 원인과 촉발 요인

**촉발 요인:** Redis를 60초 중단했다.

**확인된 원인:** 당시 `spring.data.redis.timeout`이 명시되지 않아 Lettuce의 60초
명령 타임아웃이 적용됐다. 요청이 이 대기 시간에 묶여 있었고, 타임아웃을 명시한 변경 후
실행에서는 60초 지연과 풀 획득 대기가 사라졌다.

**남은 원인 질문:** Redis 대기 중 MySQL 커넥션이 어떤 경로에서 유지됐는지 직접
계측하지 않았다. 트랜잭션 내부 호출은 가능한 경로 중 하나지만, 커넥션 포화 전체의
원인으로 확정하지 않는다. OSIV 가설과 검증 계획은
[별도 Case](db-connection-held-during-redis-wait.md)에 있다.

## 조치와 검증 결과

1. **당시 Redis 타임아웃 명시:** `spring.data.redis.timeout=200ms`,
   `spring.data.redis.connect-timeout=500ms`로 설정했다. 변경 전 정상 구간 90초의
   클라이언트 측 명령 지연은 p50 0.127ms, p99 0.570ms, p99.9 1.647ms,
   관측 최댓값 44.2ms였다. 같은 구간 GC pause 최댓값은 47.0ms였다. p99.9와
   pause 최댓값을 더한 48.6ms에 대한 200ms의 여유는 약 4.1배다. 두 값이 실제로
   동시에 발생했다는 뜻은 아니다. 아래 표는 200ms로 측정한 실행의 결과다.
2. **100ms로 축소:** 현재 설정은 100ms다. 200ms 실행과 같은 4/s·cold·60초 장애
   조건에서 fault p95는 973ms → 224ms, post p95는 435ms → 114ms였다. 두 실행
   모두 fault HTTP 오류율 0%, HikariCP pending 최대 0개였다. 정상 Redis가 타임아웃
   경계에 가까울 때의 오차단 범위는 이 장애 실행으로 판단할 수 없다.
3. **인프라 실패와 인증 실패의 상태 코드 분리:** `TokenAuthenticationFilter`는 JWT
   검증 실패를 기존처럼 익명 요청으로 처리하고, `TransientDataAccessException`,
   `DataAccessResourceFailureException`, `TransactionException`은
   `INFRASTRUCTURE_UNAVAILABLE`로 끊도록 바꿨다. `GlobalExceptionHandler`도
   이 실패를 503으로 매핑하고, 비일시적 DB 오류는 500으로 남긴다.

| 지표 | 변경 전 | 변경 후 | 읽는 법 |
|---|---:|---:|---|
| fault 오류율 | 31.75% | 0.00% | 장애 60초 동안 4xx·5xx·무응답 비율 |
| fault 완료 요청 | 274건 | 982건 | 같은 60초에 끝난 요청 수 |
| fault p95 | 60,003ms | 973ms | 60초 타임아웃에 붙던 꼬리 지연 해소 |
| fault 최대 지연 | 60,007ms | 2,727ms | |
| 실패 상태 분포 | 무응답 31 · 401 38 · 500 18 | 없음 | |
| Tomcat busy 최대 | 158개 | 3개 | fault 구간 집계, 최대 400개 |
| HikariCP pending 최대 | 127개 | 0개 | fault 구간 집계, 커넥션 획득 대기 |
| HikariCP active 최대 | 10/10 | 2/10 | fault 구간 집계 |
| MySQL threads_running | 2개 | 2개 | 두 실행 모두 낮음 |
| `/actuator/health` | 폴러가 12/12회 TIMEOUT 기록 | 12/12회 DOWN(503), p50 267ms | 과거 TIMEOUT에는 폴러 결함 가능성 있음 |
| post p95 | 6,284ms | 435ms | 복구 직후 빈 캐시 비용 포함 |
| 조회수 유실 | 160건 | 481건 | 아래 한계 참고 |

세 번째 변경의 503 분기 효과는 **이 장애 비교에서 실행되지 않았다.** 타임아웃을 줄인 뒤 풀이 포화되지
않아 인증 경로의 DB 조회가 실패하지 않았다. 변경 전 401 38건이 503으로 바뀐 것이
아니라 변경 후 실행에서 사라진 것이다. `AuthInfrastructureFailureStatusTest`는
보호 경로의 401/503 경계를, `GlobalExceptionHandlerTest.InfrastructureVersusBug`는
503/500 경계를 테스트로 확인한다. 장애 주입에서의 503 경로는 별도 검증이 필요하다.

## 배운 점과 남은 위험

**조회수 유실:** 200ms 실행에서 기대 증가분 811건 중 481건이 DB와 Redis 버퍼에
남지 않았다. 응답 가용성 개선과 별개의 정합성 문제이며, 재현·원인·미해결 범위는
[조회수 유실 Case](redis-viewcount-loss-on-fallback.md)가 소유한다.

**헬스 응답:** 200ms 실행의 `/actuator/health`는 Redis 장애 동안 DOWN(503)을
반환했다. 현재 readiness 경로와 운영 적용 상태는
[헬스 판정 Case](redis-health-readiness.md)에 기록한다. 변경 전의 폴러 TIMEOUT
12건은 [폴러 결함](health-poller-false-timeout.md)이 수정되기 전의 표본이므로
서버가 12회 모두 4초간 응답하지 않았다는 확증으로 쓰지 않는다.

**회복 판정:** 변경 후 post 구간의 RPS는 자동 판정에서 "미회복"이었다. 기준은 pre
중앙값 15.02/s의 대역에 30초 연속 머무는 것이지만, 60초 post 끝이 부하 종료와
겹쳐 마지막 표본이 12.0 → 10.9 → 9.2 → 5.9 → 3.7 → 1.4/s로 감소했다.
따라서 이 표시는 서비스가 끝까지 회복하지 못했다는 근거로 사용하지 않는다.

## 후속 조치

| 할 일 | 확인할 것 | 상태 |
|---|---|---|
| 조회수 유실의 허용 범위와 복구 정책 결정 | [조회수 유실 Case](redis-viewcount-loss-on-fallback.md) | 미결정 |
| 운영 로드밸런서 헬스 경로 확인 | [헬스 판정 Case](redis-health-readiness.md) | 미검증 |
| MySQL 인프라 오류 경로 검증 | [MySQL 중단·무응답 Case](mysql-unavailable-wait-bound.md)의 503 분포 | 별도 실행으로 관측 |
| 커넥션 점유 원인 검증 | 트랜잭션·OSIV 가설 구분 | [별도 Case](db-connection-held-during-redis-wait.md)에서 조사 중 |

타임아웃을 200ms로 둔 같은 조건에서 지연이 다시 60초에 몰리면 이 원인 설명을
재검토해야 한다. 같은 부하에서 HikariCP pending이 다시 쌓이면 다른 장시간 점유
경로도 찾아야 한다.

## 근거

- 변경 전: [report.html](../resilience/reports/redis-crash-2026-09-11T06-06-22/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-11T06-06-22/run.json)
- 변경 후: [report.html](../resilience/reports/redis-crash-2026-09-11T06-15-49/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-11T06-15-49/run.json)
- 100ms 재검증: [report.html](../resilience/reports/redis-crash-2026-09-11T06-37-20/report.html) · [run.json](../resilience/reports/redis-crash-2026-09-11T06-37-20/run.json)
- 당시 변경 코드: `application.properties`, `TokenAuthenticationFilter`, `TokenExceptionFilter`,
  `GlobalExceptionHandler`, `ErrorCode`
